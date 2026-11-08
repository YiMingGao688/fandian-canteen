package com.sky.campus;
import com.sky.result.Result;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletResponse;
import java.util.*;
import java.io.IOException;
/** 经营报表和批量菜品入口，沿用校园管理身份及窗口权限。 */
@RestController @RequestMapping("/campus/staff")
public class CampusReportController{
    private final CampusReportService reports;private final CampusMenuService menu;
    public CampusReportController(CampusReportService reports,CampusMenuService menu){this.reports=reports;this.menu=menu;}
    /** 查询按取餐日期汇总的核销经营数据。 */
    @GetMapping("/reports") public Result<Map<String,Object>> report(@RequestParam String fromDate,@RequestParam String toDate,@RequestParam(required=false)Long windowId){return Result.success(reports.report(fromDate,toDate,windowId));}
    /** 日期与权限验证在设置下载响应前完成，失败返回原业务错误。 */
    @GetMapping("/reports/export") public void export(@RequestParam String fromDate,@RequestParam String toDate,@RequestParam(required=false)Long windowId,HttpServletResponse response)throws IOException{
        // 完整生成后才设置下载头，校验/生成失败仍由统一异常处理返回 JSON；不把大文件全部放入堆内存。
        java.nio.file.Path file=java.nio.file.Files.createTempFile("fandian-report-",".xlsx");
        try{
            try(java.io.OutputStream output=java.nio.file.Files.newOutputStream(file)){reports.excel(fromDate,toDate,windowId,output);}
            response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");response.setHeader("Content-Disposition","attachment; filename=fandian-report.xlsx");response.setContentLengthLong(java.nio.file.Files.size(file));java.nio.file.Files.copy(file,response.getOutputStream());
        }finally{java.nio.file.Files.deleteIfExists(file);}
    }
    /** 全部校验通过才批量写入，任一道菜越权会整体回滚。 */
    @PutMapping("/menu/batch/status") public Result<Void> batch(@RequestBody Batch request){menu.batchStatus(request.ids,request.status);return Result.success();}
    public static class Batch{
        /** 本次选中的菜品主键，最多五十个，拒绝小数主键被静默截断。 */@com.fasterxml.jackson.databind.annotation.JsonDeserialize(contentUsing=com.sky.campus.CampusNumberDeserializer.LongValue.class) public List<Long> ids;
        /** 0 下架，1 在售。 */@com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=com.sky.campus.CampusNumberDeserializer.IntValue.class) public Integer status;
    }
}
