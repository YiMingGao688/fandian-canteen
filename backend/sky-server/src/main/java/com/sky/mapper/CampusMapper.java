package com.sky.mapper;

import com.sky.campus.CampusModels.*;
import com.sky.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** 校园扩展的数据访问；SQL 参数使用绑定变量，写操作由 Service 事务管理。 */
@Mapper
public interface CampusMapper {
    /** 查询登录账号，密码摘要仅在服务端使用。 */
    Account account(@Param("username") String username);
    /** 按 JWT 中的用户主键重新读取角色和账号状态。 */
    Account accountByUser(@Param("userId") Long userId);
    /** 创建原 user 表记录；不套用员工字段自动填充切面。 */
    void insertUser(User user);
    /** 写入学号身份和密码摘要。 */
    void insertAccount(Account account);
    /** 在事务内锁定用户，串行处理其购物车与重复提交。 */
    Long lockUser(@Param("userId") Long userId);
    /** 查询公开窗口，包含暂停状态供客户端提示。 */
    List<Window> windows();
    /** 查询单个窗口，供预约和权限校验。 */
    Window window(@Param("id") Long id);
    /** 查询真实菜品、所属窗口、可售库存和已核销销量。 */
    List<DishView> dishes(@Param("windowId") Long windowId);
    /** 查询单道菜品，不依赖可能尚未失效的菜单缓存。 */
    DishView dish(@Param("id") Long id);
    /** 只有在售且库存足够才扣减，返回成功影响行数。 */
    int takeStock(@Param("dishId") Long dishId, @Param("quantity") int quantity);
    /** 取消预约时归还实际订单明细占用的库存。 */
    void restoreStock(@Param("dishId") Long dishId, @Param("quantity") int quantity);
    /** 更新库存和原菜品字段前锁定库存行。 */
    Long lockDish(@Param("dishId") Long dishId);
    /** 维护窗口菜品的库存、价格与上下架状态。 */
    void changeDish(@Param("change") DishChange change, @Param("userId") Long userId);
    /** 根据窗口与日期幂等创建时段，已有预约名额保持不变。 */
    void insertSlot(Slot slot);
    /** 查询一天的所有取餐时段。 */
    List<Slot> slots(@Param("windowId") Long windowId, @Param("date") LocalDate date);
    /** 下单事务内锁定时段后校验容量。 */
    Slot lockSlot(@Param("id") Long id);
    /** 原子占用一个预约名额；满额时不修改数据。 */
    int reserveSlot(@Param("id") Long id);
    /** 取消订单时释放一个预约名额，禁止出现负数。 */
    void releaseSlot(@Param("id") Long id);
    /** 写入校园预约与原 orders 的关联。 */
    void insertOrder(OrderRecord record);
    /** 查询用户相同请求是否已生成订单。 */
    Long existingRequest(@Param("userId") Long userId, @Param("requestId") String requestId);
    /** 返回本人订单或当前工作窗口订单，最多返回最近 100 条。 */
    List<OrderView> orders(@Param("userId") Long userId, @Param("windowId") Long windowId);
    /** 查询订单及对应校园预约详情。 */
    OrderView order(@Param("id") Long id);
    /** 通过支付宝通知中的商户订单号定位原订单主键。 */
    Long orderIdByNumber(@Param("number") String number);
    /** 序列化支付、取消、备餐和核销，防止重复状态迁移。 */
    Long lockOrder(@Param("id") Long id);
    /** 保存支付后生成的唯一取餐凭证。 */
    void setPickupCode(@Param("id") Long id, @Param("code") String code);
    /** 改约后同步校园时段和原订单的预计取餐时间。 */
    void reschedule(@Param("id") Long id, @Param("slotId") Long slotId, @Param("start") LocalDateTime start);
    /** 只在指定窗口查找核销凭证。 */
    Long orderByCode(@Param("windowId") Long windowId, @Param("code") String code);
    /** 记录完成核销的实际时间。 */
    void markPickedUp(@Param("id") Long id);
    /** 列出需由校园服务释放库存和名额的超时未支付订单。 */
    List<Long> expiredOrders(@Param("before") LocalDateTime before);
    /** 查询学生个人收藏。 */
    List<Long> favorites(@Param("userId") Long userId);
    /** 幂等收藏菜品。 */
    void addFavorite(@Param("userId") Long userId, @Param("dishId") Long dishId);
    /** 仅删除当前学生的收藏记录。 */
    void deleteFavorite(@Param("userId") Long userId, @Param("dishId") Long dishId);
    /** 一份已完成订单只允许写入一次评价。 */
    void insertReview(@Param("userId") Long userId, @Param("review") ReviewRequest review);
    /** 查询全校公告。 */
    List<Map<String, Object>> notices();
    /** 将反馈写入指定窗口。 */
    void insertFeedback(@Param("userId") Long userId, @Param("feedback") FeedbackRequest feedback);
    /** 查询学生本人的反馈或当前窗口反馈。 */
    List<Map<String, Object>> feedback(@Param("userId") Long userId, @Param("windowId") Long windowId);
    /** 只能回复自己窗口的反馈，返回实际影响行数。 */
    int replyFeedback(@Param("windowId") Long windowId, @Param("reply") FeedbackReply reply);
    /** 统计当前窗口真实订单指标，收入只计算已核销订单。 */
    Map<String, Object> summary(@Param("windowId") Long windowId, @Param("date") LocalDate date);
    /** 统计近七日已核销订单金额。 */
    List<Map<String, Object>> trend(@Param("windowId") Long windowId, @Param("begin") LocalDate begin);
    /** 按已核销订单明细统计菜品销量。 */
    List<Map<String, Object>> sales(@Param("windowId") Long windowId);
    /** 按已核销订单的菜品分类统计用餐偏好，不分析无来源的个人画像。 */
    List<Map<String, Object>> preferences(@Param("windowId") Long windowId);
    /** 大屏按预约日期聚合各窗口订单状态，不查询学生个人信息。 */
    List<Map<String, Object>> windowOverview(@Param("date") LocalDate date);
    /** 大屏按所选日期统计已发布时段的名额占用。 */
    Map<String, Object> slotUsage(@Param("date") LocalDate date);
    /** 大屏取餐时段预约分布，仅返回汇总数。 */
    List<Map<String, Object>> slotDistribution(@Param("date") LocalDate date);
    /** 大屏显示最近订单的窗口、状态和时间，不包含学号、姓名及取餐码。 */
    List<Map<String, Object>> activity();
}
