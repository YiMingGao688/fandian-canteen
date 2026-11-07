package com.sky.campus;

import com.sky.exception.BaseException;
import java.time.Duration;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import static com.sky.campus.CampusCatalogService.require;

/** 将既有 opening_hours 文本规范为可预约的当天营业区间，不新增数据库字段。 */
final class CampusHours {
    private CampusHours() { }

    /** 校验最多四段、不重叠且每段至少二十分钟的当天营业时间，返回按起点排序的区间。 */
    static List<LocalTime[]> ranges(String value) {
        require(value != null && !value.trim().isEmpty() && value.trim().length() <= 80, "请填写营业时间，最多 80 字");
        String normalized=value.trim().replace('–','-').replace('—','-').replace('－','-');
        String[] parts=normalized.split("/",-1); require(parts.length<=4,"营业时间最多设置四段");
        List<LocalTime[]> ranges=new ArrayList<>();
        try {
            for(String part:parts){
                String segment=part.trim(); require(segment.matches("[0-2][0-9]:[0-5][0-9]\\s*-\\s*[0-2][0-9]:[0-5][0-9]"),"营业时间格式为 07:00-09:00，多段用 / 分隔");
                String[] pair=segment.split("-"); LocalTime start=LocalTime.parse(pair[0].trim()),end=LocalTime.parse(pair[1].trim());
                require(end.isAfter(start)&&Duration.between(start,end).toMinutes()>=20,"每段营业时间至少二十分钟，且不能跨午夜"); ranges.add(new LocalTime[]{start,end});
            }
        }catch(java.time.DateTimeException ex){throw new BaseException("请填写有效的营业时间");}
        ranges.sort(Comparator.comparing(pair->pair[0]));
        for(int i=1;i<ranges.size();i++)require(!ranges.get(i)[0].isBefore(ranges.get(i-1)[1]),"营业时间不能重叠");
        return ranges;
    }

    /** 保存标准格式，兼容初始化数据原有的短横线与连接号写法。 */
    static String normalize(String value) { return ranges(value).stream().map(pair->pair[0]+"-"+pair[1]).collect(Collectors.joining(" / ")); }

    /** 旧时段仍保留历史预约，但新预约必须完整落在当前营业区间内。 */
    static boolean includes(String hours,String start,String end) {
        LocalTime from=LocalTime.parse(start),to=LocalTime.parse(end);
        return ranges(hours).stream().anyMatch(pair->!from.isBefore(pair[0])&&!to.isAfter(pair[1])&&Duration.between(from,to).toMinutes()==20&&Duration.between(pair[0],from).toMinutes()%20==0);
    }
}
