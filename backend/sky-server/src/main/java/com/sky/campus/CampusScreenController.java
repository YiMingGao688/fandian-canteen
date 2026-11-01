package com.sky.campus;

import com.sky.result.Result;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.Map;

/** 独立大屏入口，访问角色由 Shiro 限定为管理员或只读展示账号。 */
@RestController
@RequestMapping("/campus/screen")
public class CampusScreenController {
    private final CampusScreenService service;
    public CampusScreenController(CampusScreenService service){this.service=service;}
    /** 只读展示校园运营聚合数据，不提供大屏端写入接口。 */
    @GetMapping("/overview")
    public Result<Map<String,Object>> overview(@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date){return Result.success(service.overview(date));}
}
