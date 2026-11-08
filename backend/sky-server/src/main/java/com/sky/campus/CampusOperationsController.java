package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.campus.CampusOperationsModels.*;
import com.sky.result.PageResult;
import com.sky.result.Result;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 运营设置与历史订单入口，身份由校园拦截器校验，具体权限由 Service 再次限定。 */
@RestController
@RequestMapping("/campus/staff")
public class CampusOperationsController {
    private final CampusOperationsService operations;
    private final CampusOrderQueryService queries;
    private final CampusOrderService orders;
    public CampusOperationsController(CampusOperationsService operations,CampusOrderQueryService queries,CampusOrderService orders){this.operations=operations;this.queries=queries;this.orders=orders;}

    /** 管理员分页查询工作账号，响应不含密码或摘要。 */
    @GetMapping("/accounts") public Result<PageResult> accounts(AccountQuery query){return Result.success(operations.accounts(query));}
    /** 同一事务创建原用户与校园工作账号，角色和窗口范围由服务端校验。 */
    @PostMapping("/accounts") public Result<Account> createAccount(@RequestBody AccountSave request){return Result.success(operations.saveAccount(null,request));}
    /** 修改工作账号资料与启停状态，不能停用或降级当前管理员。 */
    @PutMapping("/accounts/{id}") public Result<Account> updateAccount(@PathVariable Long id,@RequestBody AccountSave request){return Result.success(operations.saveAccount(id,request));}
    /** 仅改变账号启停状态，避免列表旧资料覆盖最新权限设置。 */
    @PutMapping("/accounts/{id}/status") public Result<Void> accountStatus(@PathVariable Long id,@RequestBody EnabledChange request){operations.accountStatus(id,request.getEnabled());return Result.success();}
    /** 重置工作账号密码，成功后原令牌失效，不回传明文密码。 */
    @PostMapping("/accounts/{id}/password") public Result<Void> password(@PathVariable Long id,@RequestBody PasswordReset request){operations.resetPassword(id,request);return Result.success();}
    /** 管理员返回全校窗口，工作人员只返回绑定窗口。 */
    @GetMapping("/settings/windows") public Result<List<Window>> windows(){return Result.success(operations.windows());}
    /** 新增食堂窗口仅允许全校管理员，窗口主键由数据库生成。 */
    @PostMapping("/settings/windows") public Result<Window> createWindow(@RequestBody WindowSave request){return Result.success(operations.saveWindow(null,request));}
    /** 持久化窗口资料、当前营业状态与实际预约时间规则。 */
    @PutMapping("/settings/windows/{id}") public Result<Window> updateWindow(@PathVariable Long id,@RequestBody WindowSave request){return Result.success(operations.saveWindow(id,request));}
    /** 快速暂停或恢复预约，既有订单可继续处理。 */
    @PutMapping("/settings/windows/{id}/status") public Result<Void> windowStatus(@PathVariable Long id,@RequestBody EnabledChange request){operations.windowStatus(id,request.getEnabled());return Result.success();}
    /** 服务端分页查询全量历史，窗口人员不能通过筛选参数扩大权限。 */
    @GetMapping("/orders/page") public Result<PageResult> page(OrderQuery query){return Result.success(queries.page(query));}
    /** 窗口拒绝尚未接单的预约，退款、归还库存和名额由订单事务统一处理。 */
    @PostMapping("/orders/{id}/reject") public Result<OrderView> reject(@PathVariable Long id,@RequestBody OperationReason request){return Result.success(orders.terminate(id,"reject",request.getReason()));}
    /** 管理取消尚未核销预约，原因必填，重复请求不重复释放资源。 */
    @PostMapping("/orders/{id}/cancel") public Result<OrderView> cancel(@PathVariable Long id,@RequestBody OperationReason request){return Result.success(orders.terminate(id,"cancel",request.getReason()));}
}
