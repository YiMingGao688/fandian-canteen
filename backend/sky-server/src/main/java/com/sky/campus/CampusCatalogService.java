package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.context.BaseContext;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusMapper;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/** 校园窗口、菜谱、预约时段和互动管理，查询沿用项目 MyBatis 与 Redis。 */
@Service
public class CampusCatalogService {
    static final String MENU_KEY = "campus:menu:v1";
    static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private final CampusMapper mapper;
    private final RedisTemplate redis;
    private final CampusAuthService auth;

    public CampusCatalogService(CampusMapper mapper, @Qualifier("redisTemplate") RedisTemplate redis, CampusAuthService auth) {
        this.mapper = mapper; this.redis = redis; this.auth = auth;
    }

    /**
     * 获取食堂窗口，包含营业状态和取餐位置，不返回任何学生数据。
     * @return 数据库中的窗口列表
     */
    public List<Window> windows() { return mapper.windows(); }

    /**
     * 查询校园菜单；全校菜谱缓存 30 秒，再在服务端按窗口过滤。
     * 库存仍由下单事务再次核查，缓存不作为扣库存依据。
     * @param windowId 可选的窗口主键
     * @return 包含库存、营养估算值和真实销量的菜谱列表
     */
    @SuppressWarnings("unchecked")
    public List<DishView> menu(Long windowId) {
        List<DishView> dishes = (List<DishView>) redis.opsForValue().get(MENU_KEY);
        if (dishes == null) {
            dishes = mapper.dishes(null);
            redis.opsForValue().set(MENU_KEY, dishes, 30, TimeUnit.SECONDS);
        }
        return dishes.stream().filter(d -> windowId == null || windowId.equals(d.getWindowId())).collect(Collectors.toList());
    }

    /**
     * 公开菜谱只返回在售菜品，不向未登录访问者暴露已下架菜品的价格与展示资料。
     * 管理端仍通过 menu() 读取全部菜品，以便维护下架记录和历史订单引用。
     * @param windowId 可选的窗口主键
     * @return 当前在售的菜谱列表
     */
    public List<DishView> publicMenu(Long windowId) {
        return menu(windowId).stream().filter(d -> Integer.valueOf(1).equals(d.getStatus())).collect(Collectors.toList());
    }

    /**
     * 按窗口当前营业区间幂等发布二十分钟时段，过滤距开始不足五分钟或已被新营业时间排除的时段。
     * 只开放今天与明天，既有时段的名额和已预约数不会被重新初始化。
     * @param windowId 预约窗口
     * @param date 就餐日期
     * @return 可以继续预约的未来时段，满额状态由 capacity 与 reserved 决定
     * @throws BaseException 日期越界、窗口不存在或暂停预约
     */
    @Transactional
    public List<Slot> slots(Long windowId, LocalDate date) {
        LocalDate today = LocalDate.now(ZONE);
        require(date != null && !date.isBefore(today) && !date.isAfter(today.plusDays(1)), "仅开放今天和明天的预约");
        Window window = openWindow(windowId);
        // 先读取已发布时段，重复浏览只对缺失时段写入；并发发布仍由唯一键和 insert ignore 兜底。
        Set<String> published = mapper.slots(windowId, date).stream().map(Slot::getStartTime).collect(Collectors.toSet());
        for (LocalTime[] meal : CampusHours.ranges(window.getOpeningHours())) {
            for (LocalTime start = meal[0]; !start.plusMinutes(20).isAfter(meal[1]) && start.plusMinutes(20).isAfter(start); start = start.plusMinutes(20)) {
                if (!published.add(start.toString())) continue;
                Slot slot = new Slot(); slot.setWindowId(windowId); slot.setServiceDate(date);
                slot.setStartTime(start.toString()); slot.setEndTime(start.plusMinutes(20).toString());
                slot.setCapacity(window.getCapacity()); mapper.insertSlot(slot);
            }
        }
        LocalDateTime earliest = LocalDateTime.now(ZONE).plusMinutes(5);
        return mapper.slots(windowId, date).stream().filter(s -> LocalDateTime.of(date, LocalTime.parse(s.getStartTime())).isAfter(earliest) && withinHours(window,s)).collect(Collectors.toList());
    }

    /** 新预约或改约校验当前营业区间，旧时段主键不能绕过已修改的营业时间。 */
    boolean withinHours(Window window,Slot slot){return CampusHours.includes(window.getOpeningHours(),slot.getStartTime(),slot.getEndTime());}

    /**
     * 获取当前学生收藏的菜品主键，不读取其他学生的收藏。
     * @return 本人的收藏主键列表
     */
    public List<Long> favorites() { return mapper.favorites(BaseContext.getCurrentId()); }

    /**
     * 校验菜品存在后幂等添加或移除当前学生收藏。
     * @param dishId 菜品主键
     * @param enabled true 收藏，false 取消
     * @throws BaseException 菜品不存在
     */
    public void favorite(Long dishId, boolean enabled) {
        require(mapper.dish(dishId) != null, "菜品不存在");
        if (enabled) mapper.addFavorite(BaseContext.getCurrentId(), dishId);
        else mapper.deleteFavorite(BaseContext.getCurrentId(), dishId);
    }

    /**
     * 仅允许本人已核销的订单发表一次 1 至 5 星评价，写入后使菜单评分缓存失效。
     * @param review 订单、评分与评价文字
     * @throws BaseException 订单不属于本人、尚未取餐、重复评价或字段不合法
     */
    @Transactional
    public void review(ReviewRequest review) {
        require(review != null && review.getOrderId() != null, "请选择已取餐的订单");
        mapper.lockOrder(review.getOrderId());
        OrderView order = mapper.order(review.getOrderId());
        require(order != null && BaseContext.getCurrentId().equals(order.getUserId()), "订单不存在");
        require(order.getStatus() == 5, "取餐完成后才可以评价");
        require(!Boolean.TRUE.equals(order.getReviewed()), "这份订单已经评价过了");
        require(review.getRating() != null && review.getRating() >= 1 && review.getRating() <= 5, "评分需为 1 至 5 星");
        review.setContent(text(review.getContent(), 300, "请填写 1 至 300 字的评价"));
        mapper.insertReview(BaseContext.getCurrentId(), review);
        invalidateMenu();
    }

    /**
     * 读取校园公告，按发布时间倒序展示。
     * @return 公告标题、正文、类别和发布日期
     */
    public List<Map<String, Object>> notices() { return mapper.notices(); }

    /**
     * 保存当前学生对指定窗口的反馈；后续管理查询仍按窗口工作人员绑定或管理员全校权限过滤。
     * @param feedback 目标窗口和反馈内容
     * @throws BaseException 窗口不存在或内容超出 500 字
     */
    public void submitFeedback(FeedbackRequest feedback) {
        require(feedback != null && mapper.window(feedback.getWindowId()) != null, "请选择反馈窗口");
        feedback.setContent(text(feedback.getContent(), 500, "请填写 1 至 500 字的反馈"));
        mapper.insertFeedback(BaseContext.getCurrentId(), feedback);
    }

    /**
     * 查询反馈；学生只看本人，窗口工作人员只看所属窗口，管理员可查看全校反馈。
     * @param staff 是否使用窗口管理视角
     * @return 权限范围内的反馈与回复
     */
    public List<Map<String, Object>> feedback(boolean staff) {
        return mapper.feedback(staff ? null : BaseContext.getCurrentId(), staff ? staffWindow() : null);
    }

    /**
     * 按窗口人员绑定的窗口或管理员全校权限回复反馈，禁止普通窗口人员越权处理其他窗口内容。
     * @param reply 反馈主键和回复内容
     * @throws BaseException 反馈不属于本窗口或回复为空、超长
     */
    public void reply(FeedbackReply reply) {
        require(reply != null && reply.getId() != null, "请选择反馈记录");
        reply.setReply(text(reply.getReply(), 500, "请填写 1 至 500 字的回复"));
        require(mapper.replyFeedback(staffWindow(), reply) == 1, "反馈不存在或不属于当前窗口");
    }

    /**
     * 维护权限范围内菜品的库存、单价及上下架；先锁库存行，再更新并清理菜品缓存。
     * @param change 菜品主键与新的业务字段
     * @throws BaseException 越权、库存或价格超出合理范围、状态不合法
     */
    @Transactional
    public void changeDish(DishChange change) {
        require(change != null && change.getId() != null, "请选择菜品");
        mapper.lockDish(change.getId());
        DishView dish = mapper.dish(change.getId());
        require(dish != null && managesWindow(dish.getWindowId()), "当前账号不能维护这个窗口的菜品");
        // 单独上下架时使用锁内最新库存和价格，避免旧页面把已售份数补回库存。
        if (change.getStock() == null) change.setStock(dish.getStock());
        if (change.getPrice() == null) change.setPrice(dish.getPrice());
        if (change.getStatus() == null) change.setStatus(dish.getStatus());
        require(change.getStock() != null && change.getStock() >= 0 && change.getStock() <= 10000, "库存应为 0 至 10000 份");
        require(change.getStatus() != null && (change.getStatus() == 0 || change.getStatus() == 1), "请选择正确的上下架状态");
        require(change.getPrice() != null && change.getPrice().signum() > 0 && change.getPrice().scale() <= 2 && change.getPrice().doubleValue() <= 999, "价格应大于 0 且不超过 999 元，最多两位小数");
        mapper.changeDish(change, BaseContext.getCurrentId());
        invalidateMenu(dish.getCategoryId());
    }

    /**
     * 菜品或分类事务提交后清理校园及原分类菜单缓存，避免事务提交前被并发请求重新写入旧值。
     * Redis 短时不可用时记录告警并由原有 30 秒 TTL 兜底，不将已成功提交的新增伪装成失败。
     * @param categoryIds 发生变化的新旧分类，允许空值或重复值
     */
    void invalidateMenu(Long... categoryIds) {
        Runnable invalidate = () -> {
            try {
                redis.delete(MENU_KEY);
                Arrays.stream(categoryIds).filter(Objects::nonNull).distinct().forEach(id -> redis.delete("dish_" + id));
            } catch (RuntimeException ex) {
                org.slf4j.LoggerFactory.getLogger(CampusCatalogService.class).warn("菜品已提交，菜单缓存清理失败，等待缓存自然过期", ex);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { invalidate.run(); }
            });
        } else invalidate.run();
    }

    /**
     * 汇总权限范围内的订单队列、已核销收入、近七日趋势、菜品销量和分类偏好；管理员读取全校数据。
     * 历史日期没有交易时补零，统计全部由 SQL 聚合得到，不使用前端随机数。
     * @return 看板指标和三个图表的数据
     * @throws BaseException 当前账号不具备窗口管理或系统管理权限
     */
    public Map<String, Object> dashboard() {
        Long window = staffWindow(); LocalDate today = LocalDate.now(ZONE);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", mapper.summary(window, today));
        Map<String, Object> daily = new HashMap<>();
        mapper.trend(window, today.minusDays(6)).forEach(row -> daily.put(row.get("day").toString(), row.get("amount")));
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            String day = today.minusDays(i).toString(); Map<String, Object> row = new LinkedHashMap<>();
            row.put("day", day); row.put("amount", daily.getOrDefault(day, 0)); trend.add(row);
        }
        result.put("trend", trend); result.put("sales", mapper.sales(window));
        result.put("preferences", mapper.preferences(window));
        if (window == null) {
            Window campus = new Window(); campus.setName("全校食堂"); campus.setCanteenName("统一管理"); campus.setLocation("一食堂 · 二食堂 · 多窗口运营");
            result.put("window", campus);
        } else result.put("window", mapper.window(window));
        return result;
    }

    /** 根据服务器当前账号确定管理范围；管理员返回空窗口表示全校，窗口人员只返回数据库绑定窗口。 */
    Long staffWindow() {
        Account account = auth.current();
        // 管理员管理全部窗口；窗口工作人员仍严格限定在数据库绑定的窗口。
        if ("ADMIN".equals(account.getRole())) return null;
        require("STAFF".equals(account.getRole()) && account.getWindowId() != null, "当前账号没有窗口管理权限");
        return account.getWindowId();
    }

    /** 对具体窗口执行写操作前检查管理员范围或窗口绑定，展示账号无法获得此范围。 */
    boolean managesWindow(Long windowId) { Long scope = staffWindow(); return scope == null || scope.equals(windowId); }

    /** 校验窗口是否真实存在并开放预约。 */
    Window openWindow(Long windowId) {
        Window window = windowId == null ? null : mapper.window(windowId);
        require(window != null && Integer.valueOf(1).equals(window.getEnabled()), "这个窗口暂未开放预约");
        return window;
    }

    /** 统一校验可见文本，避免空内容和超长字段落库。 */
    static String text(String value, int max, String message) {
        require(value != null && !value.trim().isEmpty() && value.trim().length() <= max, message);
        return value.trim();
    }

    /** 沿用原项目的业务异常与统一返回结构。 */
    static void require(boolean accepted, String message) { if (!accepted) throw new BaseException(message); }
}
