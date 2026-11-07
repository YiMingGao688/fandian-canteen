package com.sky.campus;

import com.sky.campus.CampusModels.OrderView;
import com.sky.campus.CampusOperationsModels.OrderQuery;
import com.sky.exception.BaseException;
import com.sky.result.PageResult;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.math.BigDecimal;
import java.util.*;
import java.io.*;
import static com.sky.campus.CampusCatalogService.require;

/** 按取餐日期生成授权范围的经营报表，收入统一仅计算已核销订单。 */
@Service
public class CampusReportService {
    private final CampusOrderQueryService queries;
    public CampusReportService(CampusOrderQueryService queries){this.queries=queries;}

    /**
     * 在一致性只读事务中遍历全部匹配订单，汇总每日预约、核销收入、退款和取消数量。
     * @param from 开始取餐日期（含）
     * @param to 结束取餐日期（含），单次最多 366 天
     * @param windowId 管理员可选窗口；窗口人员由原查询服务再次限定
     * @return 查询范围、总计及补齐零值日期的每日指标
     * @throws BaseException 日期非法、跨度过大或窗口越权
     */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Map<String,Object> report(String from,String to,Long windowId){
        OrderQuery query=criteria(from,to,windowId);Map<String,Map<String,Object>> days=new LinkedHashMap<>();
        for(LocalDate day=LocalDate.parse(from);!day.isAfter(LocalDate.parse(to));day=day.plusDays(1))days.put(day.toString(),bucket(day.toString()));
        Map<String,Object> total=bucket("合计");
        each(query,order->{accumulate(total,order);accumulate(days.get(order.getServiceDate().toString()),order);});
        Map<String,Object> result=new LinkedHashMap<>();result.put("fromDate",from);result.put("toDate",to);result.put("summary",total);result.put("daily",new ArrayList<>(days.values()));return result;
    }

    /**
     * 输出同一范围的 Excel 日报及全量订单明细，流式工作簿只保留一百行内存并清理临时文件。
     * 文本写为字符串单元格，用户名称或备注不会作为公式执行；不导出取餐码、学号。
     * @param from 开始取餐日期
     * @param to 结束取餐日期
     * @param windowId 授权窗口筛选
     * @param output HTTP 输出流，由调用方关闭
     * @throws IOException 写入失败
     * @throws BaseException 日期或权限不合法
     */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public void excel(String from,String to,Long windowId,OutputStream output)throws IOException{
        OrderQuery query=criteria(from,to,windowId);Map<String,Object> report=report(from,to,windowId);
        SXSSFWorkbook workbook=new SXSSFWorkbook(100);
        try{
            Sheet daily=workbook.createSheet("每日经营");row(daily,0,"取餐日期","预约数","已核销数","核销收入（元）","取消数","退款金额（元）");
            int n=1;for(Map<String,Object> day:(List<Map<String,Object>>)report.get("daily"))row(daily,n++,day.get("day"),day.get("orders"),day.get("completed"),day.get("revenue"),day.get("cancelled"),day.get("refund"));
            Map<String,Object> total=(Map<String,Object>)report.get("summary");row(daily,n,"合计",total.get("orders"),total.get("completed"),total.get("revenue"),total.get("cancelled"),total.get("refund"));
            Sheet details=workbook.createSheet("全部订单明细");row(details,0,"订单号","取餐日期","窗口","订单状态","金额（元）","支付状态","取消说明");int[] index={1};
            each(query,order->row(details,index[0]++,order.getNumber(),order.getServiceDate().toString(),order.getCanteenName()+" · "+order.getWindowName(),state(order.getStatus()),order.getAmount(),order.getPayStatus()==2?"已退回":order.getPayStatus()==1?"已支付":"未支付",order.getCancelReason()));
            for(Sheet sheet:List.of(daily,details)){sheet.createFreezePane(0,1);for(int c=0;c<8;c++)sheet.setColumnWidth(c,c==0?26*256:20*256);}
            workbook.write(output);
        }finally{try{workbook.close();}finally{workbook.dispose();}}
    }
    /** 校验 ISO 日期及最大跨度，强制使用全部订单状态，清除无关搜索条件。 */
    private OrderQuery criteria(String from,String to,Long windowId){
        try{LocalDate start=LocalDate.parse(from),end=LocalDate.parse(to);require(!end.isBefore(start)&&ChronoUnit.DAYS.between(start,end)<=365,"请选择不超过 366 天的日期范围");}
        catch(java.time.DateTimeException|NullPointerException ex){throw new BaseException("请填写有效的开始和结束日期");}
        OrderQuery query=new OrderQuery();query.setState("all");query.setFromDate(from);query.setToDate(to);query.setWindowId(windowId);query.setPageSize(50);return query;
    }
    /** 按五十行读取全量匹配订单，复用原服务的权限校验和明细快照，不截断为最近一百笔。 */
    private void each(OrderQuery query,java.util.function.Consumer<OrderView> consumer){
        long count;do{PageResult page=queries.page(query);count=page.getTotal();for(Object item:page.getRecords())consumer.accept((OrderView)item);query.setPage(query.getPage()+1);}while((long)(query.getPage()-1)*query.getPageSize()<count);
    }
    /** 建立空日期指标，金额始终使用十进制类型。 */
    private Map<String,Object> bucket(String day){Map<String,Object> map=new LinkedHashMap<>();map.put("day",day);map.put("orders",0L);map.put("completed",0L);map.put("cancelled",0L);map.put("revenue",BigDecimal.ZERO);map.put("refund",BigDecimal.ZERO);return map;}
    /** 累计订单数；收入仅核销，退款金额依原订单支付状态计算，不与收入混淆。 */
    private void accumulate(Map<String,Object> bucket,OrderView order){bucket.put("orders",(Long)bucket.get("orders")+1);if(order.getStatus()==5){bucket.put("completed",(Long)bucket.get("completed")+1);bucket.put("revenue",((BigDecimal)bucket.get("revenue")).add(order.getAmount()));}if(order.getStatus()==6)bucket.put("cancelled",(Long)bucket.get("cancelled")+1);if(order.getPayStatus()==2)bucket.put("refund",((BigDecimal)bucket.get("refund")).add(order.getAmount()));}
    /** 数字与文本分别写入单元格，禁止将外部输入设为 Excel 公式。 */
    private void row(Sheet sheet,int index,Object...values){Row row=sheet.createRow(index);for(int i=0;i<values.length;i++){Cell cell=row.createCell(i);Object value=values[i];if(value instanceof Number)cell.setCellValue(((Number)value).doubleValue());else cell.setCellValue(value==null?"":value.toString());}}
    /** 将校园状态码映射为报表业务文字。 */
    private String state(Integer value){return new String[]{"","待支付","待接单","备餐中","待取餐","已核销","已取消"}[value>=1&&value<=6?value:0];}
}
