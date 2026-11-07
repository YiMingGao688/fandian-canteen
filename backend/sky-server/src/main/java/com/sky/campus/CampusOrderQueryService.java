package com.sky.campus;

import com.sky.campus.CampusModels.OrderView;
import com.sky.campus.CampusOperationsModels.OrderQuery;
import com.sky.entity.OrderDetail;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusOperationsMapper;
import com.sky.result.PageResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;
import static com.sky.campus.CampusCatalogService.require;

/** 校园订单全量历史查询；服务端分页与窗口权限不依赖前端已加载的最近订单。 */
@Service
public class CampusOrderQueryService {
    private final CampusOperationsMapper mapper;
    private final CampusCatalogService catalog;
    public CampusOrderQueryService(CampusOperationsMapper mapper,CampusCatalogService catalog){this.mapper=mapper;this.catalog=catalog;}

    /**
     * 查询授权窗口内完整订单历史，按状态、取餐日期和关键词过滤，并一次批量补齐当前页明细。
     * 总数、订单及菜品快照使用同一只读一致性事务；每次最多返回五十笔，不受原 limit 100 限制。
     * @param query 页码、数量、状态、日期、关键词及管理员可选窗口
     * @return 全部匹配总数及当前页的订单和原价格快照
     * @throws BaseException 越权、查询状态/日期/分页条件不合法
     */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PageResult page(OrderQuery query){
        require(query!=null,"请提供订单查询条件");CampusOperationsService.pageBounds(query.getPage(),query.getPageSize());
        require(Set.of("active","all","1","2","3","4","5","6").contains(query.getState()==null?"":query.getState()),"请选择正确的订单状态");
        Long scope=catalog.staffWindow();require(scope==null||query.getWindowId()==null||scope.equals(query.getWindowId()),"只能查询绑定窗口的订单");
        if(scope!=null)query.setWindowId(scope);if(query.getWindowId()!=null)require(query.getWindowId()>0,"请选择正确的窗口");
        LocalDate from=date(query.getFromDate()),to=date(query.getToDate());require(from==null||to==null||!to.isBefore(from),"结束日期不能早于开始日期");
        query.setFromDate(from==null?null:from.toString());query.setToDate(to==null?null:to.toString());
        query.setKeyword(CampusOperationsService.keyword(query.getKeyword()));query.setOffset((long)(query.getPage()-1)*query.getPageSize());
        long total=mapper.orderCount(query);if(total==0)return new PageResult(0,List.of());
        List<OrderView> rows=mapper.orderPage(query);
        if(!rows.isEmpty()){
            Map<Long,List<OrderDetail>> lines=mapper.pageOrderDetails(rows.stream().map(OrderView::getId).collect(Collectors.toList())).stream().collect(Collectors.groupingBy(OrderDetail::getOrderId));
            rows.forEach(order->order.setItems(lines.getOrDefault(order.getId(),List.of())));
        }
        return new PageResult(total,rows);
    }

    /** 只接受完整 ISO 日期，拒绝不合法日期及数据库会隐式纠正的日期输入。 */
    private LocalDate date(String value){
        if(value==null||value.isBlank())return null;
        try{require(value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"),"日期格式应为 yyyy-MM-dd");return LocalDate.parse(value);}
        catch(DateTimeParseException ex){throw new BaseException("请填写有效的取餐日期");}
    }
}
