package com.sky.campus;

import com.sky.mapper.CampusMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/** 校园食堂独立大屏，只读取运营汇总，不复用会返回个人资料的订单详情接口。 */
@Service
public class CampusScreenService {
    private final CampusMapper mapper;
    public CampusScreenService(CampusMapper mapper) { this.mapper=mapper; }

    /**
     * 汇总全校食堂的经营指标、窗口状态、预约名额、时段分布和已核销销售数据。
     * 所有数值从数据库读取，近七日空白日期补零；本方法不发布时段或修改订单。
     * 返回内容不含学生姓名、学号、联系方式和取餐凭证。
     * @param date 查看预约分布的日期，仅开放今天或明天
     * @return 可直接供独立 ECharts 大屏使用的只读数据
     * @throws com.sky.exception.BaseException 日期不在允许范围
     */
    @Transactional(readOnly=true)
    public Map<String,Object> overview(LocalDate date) {
        LocalDate today=LocalDate.now(CampusCatalogService.ZONE);
        CampusCatalogService.require(date!=null&&!date.isBefore(today)&&!date.isAfter(today.plusDays(1)),"请选择今天或明天的预约视图");
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("summary",mapper.summary(null,today));
        result.put("windows",mapper.windowOverview(date)); result.put("slotUsage",mapper.slotUsage(date));
        result.put("slots",mapper.slotDistribution(date)); result.put("sales",mapper.sales(null));
        result.put("preferences",mapper.preferences(null)); result.put("activity",mapper.activity());
        Map<String,Object> daily=new HashMap<>();
        mapper.trend(null,today.minusDays(6)).forEach(row->daily.put(row.get("day").toString(),row.get("amount")));
        List<Map<String,Object>> trend=new ArrayList<>();
        for(int i=6;i>=0;i--){Map<String,Object> row=new LinkedHashMap<>();String day=today.minusDays(i).toString();row.put("day",day);row.put("amount",daily.getOrDefault(day,0));trend.add(row);}
        result.put("trend",trend); result.put("serviceDate",date); result.put("updatedAt",LocalDateTime.now(CampusCatalogService.ZONE));
        return result;
    }
}
