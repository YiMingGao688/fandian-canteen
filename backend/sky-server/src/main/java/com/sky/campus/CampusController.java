package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.entity.ShoppingCart;
import com.sky.result.Result;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 校园网页接口，复用 Result 返回结构；写入规则和权限范围统一由校园 Service 执行。 */
@RestController
@RequestMapping("/campus")
public class CampusController {
    private final CampusAuthService auth;
    private final CampusCatalogService catalog;
    private final CampusOrderService orders;

    public CampusController(CampusAuthService auth, CampusCatalogService catalog, CampusOrderService orders) {
        this.auth = auth; this.catalog = catalog; this.orders = orders;
    }

    /** 学生学号或窗口账号登录，不记录密码请求对象。 */
    @PostMapping("/auth/login") public Result<LoginResult> login(@RequestBody LoginRequest request) { return Result.success(auth.login(request)); }
    /** 公开注册入口仅能生成学生身份，角色由后端固定。 */
    @PostMapping("/auth/register") public Result<LoginResult> register(@RequestBody LoginRequest request) { return Result.success(auth.register(request)); }
    /** 返回当前已认证账号，不包含密码摘要。 */
    @GetMapping("/me") public Result<Account> me() { return Result.success(auth.current()); }
    /** 食堂、窗口和实际营业状态。 */
    @GetMapping("/public/windows") public Result<List<Window>> windows() { return Result.success(catalog.windows()); }
    /** 公共菜谱，窗口条件只影响展示，不影响用户权限。 */
    @GetMapping("/public/menu") public Result<List<DishView>> menu(@RequestParam(required=false) Long windowId) { return Result.success(catalog.menu(windowId)); }
    /** 未来两天的可预约时段，使用上海日期。 */
    @GetMapping("/public/slots") public Result<List<Slot>> slots(@RequestParam Long windowId, @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date) { return Result.success(catalog.slots(windowId, date)); }
    /** 校园公告列表。 */
    @GetMapping("/public/notices") public Result<List<Map<String,Object>>> notices() { return Result.success(catalog.notices()); }
    /** 当前学生购物车快照。 */
    @GetMapping("/student/cart") public Result<List<ShoppingCart>> cart() { return Result.success(orders.cart()); }
    /** 调整一份菜品，服务端检查在售、库存和同一窗口约束。 */
    @PostMapping("/student/cart") public Result<Void> cart(@RequestBody CartChange change) { orders.changeCart(change); return Result.success(); }
    /** 清空本人购物车。 */
    @DeleteMapping("/student/cart") public Result<Void> clearCart() { orders.clearCart(); return Result.success(); }
    /** 根据购物车和时段创建幂等预约，金额由数据库菜价计算。 */
    @PostMapping("/student/orders") public Result<OrderView> submit(@RequestBody SubmitRequest request) { return Result.success(orders.submit(request)); }
    /** 本人最近预约和取餐记录。 */
    @GetMapping("/student/orders") public Result<List<OrderView>> myOrders() { return Result.success(orders.list(false)); }
    /** 显式演示支付，仅变更本地演示订单状态，不扣真实资金。 */
    @PostMapping("/student/orders/{id}/pay") public Result<OrderView> pay(@PathVariable Long id) { return Result.success(orders.pay(id)); }
    /** 按当前支付模式启动演示支付或取得支付宝沙箱手机收银台地址。 */
    @PostMapping("/student/orders/{id}/payment") public Result<PaymentStartView> startPayment(@PathVariable Long id) { return Result.success(orders.startPayment(id)); }
    /** 取消本人尚未备餐预约，并归还库存及名额。 */
    @PostMapping("/student/orders/{id}/cancel") public Result<OrderView> cancel(@PathVariable Long id) { return Result.success(orders.cancel(id)); }
    /** 备餐前修改取餐时段，原子转移名额，不能改为其他窗口。 */
    @PostMapping("/student/orders/{id}/reschedule") public Result<OrderView> reschedule(@PathVariable Long id, @RequestBody SubmitRequest request) { return Result.success(orders.reschedule(id, request.getSlotId())); }
    /** 学生个人菜品收藏。 */
    @GetMapping("/student/favorites") public Result<List<Long>> favorites() { return Result.success(catalog.favorites()); }
    /** 设置收藏状态，重复请求幂等。 */
    @PutMapping("/student/favorites/{id}") public Result<Void> favorite(@PathVariable Long id, @RequestParam boolean enabled) { catalog.favorite(id, enabled); return Result.success(); }
    /** 已取餐订单评价，防止越权和重复评价。 */
    @PostMapping("/student/reviews") public Result<Void> review(@RequestBody ReviewRequest review) { catalog.review(review); return Result.success(); }
    /** 提交指向具体窗口的意见反馈。 */
    @PostMapping("/student/feedback") public Result<Void> feedback(@RequestBody FeedbackRequest feedback) { catalog.submitFeedback(feedback); return Result.success(); }
    /** 本人意见和窗口回复。 */
    @GetMapping("/student/feedback") public Result<List<Map<String,Object>>> feedback() { return Result.success(catalog.feedback(false)); }
    /** 当前人员所属窗口的订单。 */
    @GetMapping("/staff/orders") public Result<List<OrderView>> staffOrders() { return Result.success(orders.list(true)); }
    /** 窗口确认预约，开始备餐。 */
    @PostMapping("/staff/orders/{id}/accept") public Result<OrderView> accept(@PathVariable Long id) { return Result.success(orders.advance(id, false)); }
    /** 窗口完成备餐，预约进入待取餐状态。 */
    @PostMapping("/staff/orders/{id}/ready") public Result<OrderView> ready(@PathVariable Long id) { return Result.success(orders.advance(id, true)); }
    /** 按所属窗口核销取餐凭证，不接受前端直接设置“已完成”。 */
    @PostMapping("/staff/pickup") public Result<OrderView> pickup(@RequestBody PickupRequest request) { return Result.success(orders.pickup(request.getCode())); }
    /** 返回当前授权窗口范围的菜品列表；管理员可查看全校菜品，窗口账号仅查看绑定窗口。 */
    @GetMapping("/staff/menu") public Result<List<DishView>> staffMenu() { return Result.success(catalog.menu(catalog.staffWindow())); }
    /** 修改本窗口菜品库存、单价和上下架状态。 */
    @PutMapping("/staff/menu") public Result<Void> changeDish(@RequestBody DishChange change) { catalog.changeDish(change); return Result.success(); }
    /** 数据库聚合的销售与偏好看板。 */
    @GetMapping("/staff/dashboard") public Result<Map<String,Object>> dashboard() { return Result.success(catalog.dashboard()); }
    /** 所属窗口收到的反馈。 */
    @GetMapping("/staff/feedback") public Result<List<Map<String,Object>>> staffFeedback() { return Result.success(catalog.feedback(true)); }
    /** 回复所属窗口的反馈。 */
    @PostMapping("/staff/feedback/reply") public Result<Void> reply(@RequestBody FeedbackReply reply) { catalog.reply(reply); return Result.success(); }
}
