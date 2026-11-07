package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.context.BaseContext;
import com.sky.dto.ShoppingCartDTO;
import com.sky.entity.OrderDetail;
import com.sky.entity.Orders;
import com.sky.entity.ShoppingCart;
import com.sky.mapper.CampusMapper;
import com.sky.mapper.OrderDetailMapper;
import com.sky.mapper.OrderMapper;
import com.sky.service.ShoppingCartService;
import com.sky.service.AlipayGatewayService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static com.sky.campus.CampusCatalogService.require;

/** 校园预约订单：保留原订单和明细表，增加窗口、时段容量与取餐凭证。 */
@Service
@Slf4j
public class CampusOrderService {
    private final CampusMapper mapper;
    private final OrderMapper orders;
    private final OrderDetailMapper details;
    private final ShoppingCartService cart;
    private final CampusAuthService auth;
    private final CampusCatalogService catalog;
    private final AlipayGatewayService alipayGateway;
    private final RedisTemplate redis;
    private final String paymentMode;
    private static final SecureRandom RANDOM = new SecureRandom();

    public CampusOrderService(CampusMapper mapper, OrderMapper orders, OrderDetailMapper details,
            ShoppingCartService cart, CampusAuthService auth, CampusCatalogService catalog,
            AlipayGatewayService alipayGateway, @Qualifier("redisTemplate") RedisTemplate redis,
            @Value("${campus.payment-mode:demo}") String paymentMode) {
        this.mapper = mapper; this.orders = orders; this.details = details; this.cart = cart;
        this.auth = auth; this.catalog = catalog; this.alipayGateway = alipayGateway;
        this.redis = redis; this.paymentMode = paymentMode;
    }

    /**
     * 查询当前学生购物车，用户主键由认证拦截器提供，不接受外部传入的学生主键。
     * @return 原购物车服务保存的菜品快照和数量
     */
    public List<ShoppingCart> cart() { return cart.showShoppingCart(); }

    /**
     * 在用户行锁内调整一份菜品，复用原购物车增减服务；限制跨窗口混单和超量选购。
     * @param change 菜品主键与正负一份的调整量
     * @throws com.sky.exception.BaseException 菜品不可售、库存不足、跨窗口或数量非法
     */
    @Transactional
    public void changeCart(CartChange change) {
        require(change != null && change.getDishId() != null && change.getDelta() != null && Math.abs(change.getDelta()) == 1, "请选择菜品并按一份调整");
        mapper.lockUser(BaseContext.getCurrentId());
        DishView dish = mapper.dish(change.getDishId());
        require(dish != null, "菜品不存在");
        ShoppingCartDTO dto = new ShoppingCartDTO(); dto.setDishId(change.getDishId());
        if (change.getDelta() == -1) { cart.subShoppingCart(dto); return; }
        require(dish.getStatus() == 1 && dish.getStock() > 0, "这道菜暂时售罄或已下架");
        catalog.openWindow(dish.getWindowId());
        List<ShoppingCart> existing = cart.showShoppingCart();
        int count = 0;
        for (ShoppingCart item : existing) {
            DishView selected = mapper.dish(item.getDishId());
            require(selected != null && dish.getWindowId().equals(selected.getWindowId()), "一份预约只能选择同一窗口，请先清空餐盘");
            count += item.getNumber();
            if (item.getDishId().equals(dish.getId())) require(item.getNumber() < dish.getStock(), "选购数量已达到当前库存");
        }
        require(count < 20, "一份预约最多选择 20 份菜品");
        cart.addShoppingCart(dto);
    }

    /**
     * 在用户行锁内清空本人购物车，不影响其他学生或已经生成的订单。
     */
    @Transactional
    public void clearCart() { mapper.lockUser(BaseContext.getCurrentId()); cart.cleanShoppingCart(); }

    /**
     * 幂等提交校园预约：锁定用户与时段，校验同一窗口、未来日期和可售库存，
     * 从数据库重新计算金额，原子扣库存与预约名额，写入原订单和明细后清空购物车。
     * 任一步骤失败时全部回滚；相同用户重复 requestId 返回原订单。
     * @param request 时段主键、请求去重标识、用餐备注和餐具选择
     * @return 已持久化的待支付预约详情
     * @throws com.sky.exception.BaseException 时段过期、预约已满、库存不足或购物车内容不合法
     */
    @Transactional
    public OrderView submit(SubmitRequest request) {
        require(request != null && request.getSlotId() != null && request.getRequestId() != null && request.getRequestId().matches("[A-Za-z0-9-]{16,64}"), "预约请求缺少有效的时段或去重标识");
        Long user = BaseContext.getCurrentId(); mapper.lockUser(user);
        Long previous = mapper.existingRequest(user, request.getRequestId());
        if (previous != null) return full(mapper.order(previous));
        String remark = request.getRemark() == null ? "" : request.getRemark().trim();
        require(remark.length() <= 100, "点餐备注最多 100 字");
        Slot slot = mapper.lockSlot(request.getSlotId());
        require(slot != null, "预约时段不存在");
        LocalDateTime start = LocalDateTime.of(slot.getServiceDate(), LocalTime.parse(slot.getStartTime()));
        LocalDate today = LocalDate.now(CampusCatalogService.ZONE);
        require(!slot.getServiceDate().isBefore(today) && !slot.getServiceDate().isAfter(today.plusDays(1)) && start.isAfter(now().plusMinutes(5)), "预约时段已经截止，请重新选择");
        Window window = catalog.openWindow(slot.getWindowId());
        require(catalog.withinHours(window,slot),"这个时段已不在当前营业时间内，请重新选择");
        List<ShoppingCart> selected = cart.showShoppingCart();
        require(!selected.isEmpty(), "餐盘还是空的，先选几道菜吧");
        require(selected.stream().mapToInt(ShoppingCart::getNumber).sum() <= 20, "一份预约最多选择 20 份菜品");
        require(mapper.reserveSlot(slot.getId()) == 1, "这个时段预约已满，请换一个时段");
        selected.sort(Comparator.comparing(ShoppingCart::getDishId));
        ArrayList<OrderDetail> lines = new ArrayList<>(); BigDecimal amount = BigDecimal.ZERO;
        for (ShoppingCart item : selected) {
            DishView dish = mapper.dish(item.getDishId());
            require(item.getNumber() > 0 && dish != null && slot.getWindowId().equals(dish.getWindowId()), "餐盘中存在其他窗口或已失效的菜品");
            require(mapper.takeStock(dish.getId(), item.getNumber()) == 1, dish.getName() + "库存不足或已下架");
            BigDecimal unitPrice = dish.getPrice();
            amount = amount.add(unitPrice.multiply(BigDecimal.valueOf(item.getNumber())));
            lines.add(OrderDetail.builder().dishId(dish.getId()).name(dish.getName()).image(dish.getImage()).number(item.getNumber()).amount(unitPrice).build());
        }
        String number = "HX" + now().format(DateTimeFormatter.ofPattern("yyMMddHHmmss")) + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        Orders order = Orders.builder().number(number).status(Orders.PENDING_PAYMENT).userId(user)
                .addressBookId(0L).orderTime(now()).payMethod(0).payStatus(Orders.UN_PAID).amount(amount)
                .remark(remark).address(window.getLocation()).consignee(auth.current().getDisplayName())
                .estimatedDeliveryTime(start).deliveryStatus(0).packAmount(0)
                .tablewareNumber(Boolean.FALSE.equals(request.getNeedCutlery()) ? 0 : 1).tablewareStatus(0).build();
        orders.insert(order);
        for (OrderDetail line : lines) line.setOrderId(order.getId());
        details.insertBatch(lines);
        OrderRecord record = new OrderRecord(); record.setOrderId(order.getId()); record.setUserId(user);
        record.setWindowId(slot.getWindowId()); record.setSlotId(slot.getId()); record.setRequestId(request.getRequestId()); record.setDemo(false);
        mapper.insertOrder(record); cart.cleanShoppingCart(); redis.delete(CampusCatalogService.MENU_KEY);
        return full(mapper.order(order.getId()));
    }

    /**
     * 在明确启用的演示模式下完成支付状态迁移，生成八位取餐凭证，不调用或扣除真实资金。
     * 对已支付订单重复调用返回同一凭证，对取消订单拒绝支付。
     * @param id 当前学生的订单主键
     * @return 已支付预约及取餐凭证
     * @throws com.sky.exception.BaseException 非演示环境、越权或状态不允许支付
     */
    @Transactional
    public OrderView pay(Long id) {
        require("demo".equals(paymentMode), "当前环境未开放演示支付");
        OrderView order = ownedLocked(id);
        if (order.getStatus() >= 2 && order.getStatus() <= 5 && order.getPayStatus() == 1) return full(order);
        require(order.getStatus() == 1, "这份预约无法支付");
        require(order.getOrderTime().isAfter(now().minusMinutes(15)), "预约已超过支付时限，请取消后重新预约");
        mapper.setPickupCode(id, pickupCode());
        orders.update(Orders.builder().id(id).status(Orders.TO_BE_CONFIRMED).payStatus(Orders.PAID).payMethod(0).checkoutTime(now()).build());
        return full(mapper.order(id));
    }

    /**
     * 按运行模式启动支付：demo 沿用本地状态模拟，alipay-sandbox 生成支付宝手机网站收银台地址。
     * 沙箱模式只创建待支付交易，不提前改订单状态或生成取餐码；付款以验签后的服务端通知为准。
     * @param id 当前学生本人待支付订单主键
     * @return 支付模式及对应的本地订单快照或支付宝跳转地址
     * @throws com.sky.exception.BaseException 越权、订单过期、支付模式非法或沙箱配置错误
     */
    @Transactional
    public PaymentStartView startPayment(Long id) {
        if ("demo".equals(paymentMode)) {
            PaymentStartView result = new PaymentStartView();
            result.setMode("demo");
            result.setOrder(pay(id));
            return result;
        }
        require("alipay-sandbox".equals(paymentMode), "当前环境未开放支付");
        OrderView order = ownedLocked(id);
        if (order.getStatus() >= 2 && order.getStatus() <= 5 && order.getPayStatus() == 1) {
            PaymentStartView result = new PaymentStartView();
            result.setMode("paid");
            result.setOrder(full(order));
            return result;
        }
        require(order.getStatus() == 1 && order.getPayStatus() == 0, "这份预约无法支付");
        require(order.getOrderTime().isAfter(now().minusMinutes(15)), "预约已超过支付时限，请取消后重新预约");
        PaymentStartView result = new PaymentStartView();
        result.setMode("alipay");
        result.setRedirectUrl(alipayGateway.createWapPaymentUrl(order));
        return result;
    }

    /**
     * 处理已由支付宝 RSA2 验签的支付成功通知，金额、订单状态和所有迁移均由服务端确认。
     * 重复通知幂等；若未支付订单已取消，则先向支付宝退款，再记录退款状态。
     * @param orderNo 支付宝通知中的商户订单号
     * @param transactionNo 支付宝交易号，用于审计日志，不接受客户端输入
     * @param paidAmount 支付宝实际支付金额
     * @throws com.sky.exception.BaseException 订单不存在、金额不符、状态冲突或补偿退款失败
     */
    @Transactional
    public void completeAlipayPayment(String orderNo, String transactionNo, BigDecimal paidAmount) {
        require("alipay-sandbox".equals(paymentMode), "支付宝回调未启用");
        Long id = mapper.orderIdByNumber(orderNo);
        require(id != null, "支付宝通知对应的预约不存在");
        mapper.lockOrder(id);
        OrderView order = mapper.order(id);
        require(order != null && order.getAmount().compareTo(paidAmount) == 0, "支付宝通知金额与预约金额不符");
        if (order.getPayStatus() == 1 && order.getStatus() >= 2 && order.getStatus() <= 5) return;
        if (order.getStatus() == 6) {
            alipayGateway.refund(order.getNumber(), order.getAmount(), "预约已取消，自动退回沙箱支付");
            orders.update(Orders.builder().id(id).payMethod(2).payStatus(Orders.REFUND).checkoutTime(now()).build());
            return;
        }
        require(order.getStatus() == 1 && order.getPayStatus() == 0, "预约状态不允许完成支付宝支付");
        mapper.setPickupCode(id, pickupCode());
        orders.update(Orders.builder().id(id).status(Orders.TO_BE_CONFIRMED).payMethod(2)
                .payStatus(Orders.PAID).checkoutTime(now()).build());
        // 交易号只用于回调链路审计，不写入原订单表，避免无必要的结构迁移。
        log.info("支付宝沙箱支付已确认，商户订单号：{}，支付宝交易号：{}", orderNo, transactionNo);
    }

    /**
     * 学生取消尚未进入备餐的订单，归还库存和名额；重复取消不会重复归还。
     * 支付宝沙箱已付款订单先向渠道申请退款；演示支付只记录本地退款状态。
     * @param id 当前学生的订单主键
     * @return 取消后的订单详情
     * @throws com.sky.exception.BaseException 越权或窗口已经开始备餐
     */
    @Transactional
    public OrderView cancel(Long id) {
        OrderView order = ownedLocked(id);
        if (order.getStatus() == 6) return full(order);
        require(order.getStatus() == 1 || order.getStatus() == 2, "窗口已开始备餐，暂不支持在线取消");
        if (order.getPayStatus() == Orders.PAID && Objects.equals(order.getPayMethod(), 2)) {
            alipayGateway.refund(order.getNumber(), order.getAmount(), "学生取消食堂预约");
        }
        cancelLocked(order, "学生取消预约"); return full(mapper.order(id));
    }

    /**
     * 备餐前修改预约时段，锁定原时段和目标时段后转移名额，菜品与金额保持不变。
     * 目标必须为相同窗口且仍在开放预约时间内；满额时保留原预约。
     * @param id 当前学生的订单主键
     * @param slotId 新预约时段主键
     * @return 修改后的预约
     * @throws com.sky.exception.BaseException 越权、已开始备餐、时段越界或已满额
     */
    @Transactional
    public OrderView reschedule(Long id, Long slotId) {
        OrderView order = ownedLocked(id);
        require(slotId != null && (order.getStatus() == 1 || order.getStatus() == 2), "只能在窗口备餐前修改时段");
        if (slotId.equals(order.getSlotId())) return full(order);
        // 多时段更新按主键顺序加锁，避免两个改约请求互相等待。
        Long first = Math.min(slotId, order.getSlotId()), second = Math.max(slotId, order.getSlotId());
        Slot a = mapper.lockSlot(first), b = mapper.lockSlot(second);
        Slot target = slotId.equals(first) ? a : b;
        require(target != null && order.getWindowId().equals(target.getWindowId()), "只能选择原取餐窗口的时段");
        LocalDateTime start = LocalDateTime.of(target.getServiceDate(), LocalTime.parse(target.getStartTime()));
        require(start.isAfter(now().plusMinutes(5)) && !target.getServiceDate().isAfter(LocalDate.now(CampusCatalogService.ZONE).plusDays(1)), "这个时段已经截止或尚未开放");
        Window window=catalog.openWindow(target.getWindowId());
        require(catalog.withinHours(window,target),"新时段已不在当前营业时间内，原预约保持不变");
        require(mapper.reserveSlot(slotId) == 1, "新时段已满，原预约保持不变");
        mapper.releaseSlot(order.getSlotId()); mapper.reschedule(id, slotId, start);
        return full(mapper.order(id));
    }

    /**
     * 按当前身份查询订单并附带原订单明细；学生只能看到本人，窗口人员按绑定窗口过滤，管理员读取全校。
     * @param staff 是否进入窗口工作视角
     * @return 最近 100 条权限范围内的预约
     */
    public List<OrderView> list(boolean staff) {
        List<OrderView> result = mapper.orders(staff ? null : BaseContext.getCurrentId(), staff ? catalog.staffWindow() : null);
        result.forEach(this::full); return result;
    }

    /**
     * 窗口人员或管理员拒单、取消授权范围内的预约，锁定订单串行校验状态并复用原退款渠道。
     * 拒单只允许待接单；管理取消允许未支付至待取餐，已完成禁止取消。重复请求返回原取消结果，
     * 不再次退款或归还库存、名额；支付宝沙箱退款失败时整个数据库事务回滚。
     * @param id 需要处理的校园订单主键
     * @param operation reject 拒绝接单，cancel 管理取消
     * @param reason 操作原因，1 至 200 字
     * @return 取消后的订单快照，包含取消原因和原支付渠道说明
     * @throws com.sky.exception.BaseException 越权、状态不允许、原因不合规或退款失败
     */
    @Transactional
    public OrderView terminate(Long id,String operation,String reason){
        require(id!=null&&Set.of("reject","cancel").contains(operation==null?"":operation),"请选择正确的订单处理方式");
        String explanation=CampusCatalogService.text(reason,200,"请填写 1 至 200 字的处理原因");
        mapper.lockOrder(id);OrderView order=mapper.order(id);
        require(order!=null&&catalog.managesWindow(order.getWindowId()),"预约不存在或不在当前管理范围");
        if(order.getStatus()==Orders.CANCELLED)return full(order);
        boolean rejection="reject".equals(operation);
        require(rejection?order.getStatus()==2:order.getStatus()>=1&&order.getStatus()<=4,"当前状态不允许此操作，已完成预约不能取消");
        require(order.getStatus()==1?order.getPayStatus()==Orders.UN_PAID:order.getPayStatus()==Orders.PAID,"订单支付状态不一致，请先刷新");
        String note=(rejection?"窗口拒单：":"管理取消：")+explanation;
        if(order.getPayStatus()==Orders.PAID&&Objects.equals(order.getPayMethod(),2))alipayGateway.refund(order.getNumber(),order.getAmount(),note);
        cancelLocked(order,note);
        if(rejection)orders.update(Orders.builder().id(id).rejectionReason(explanation).build());
        log.info("校园管理处理订单，订单={}，操作人={}，类型={}",id,BaseContext.getCurrentId(),operation);
        return full(mapper.order(id));
    }

    /**
     * 窗口人员按绑定窗口操作，管理员可跨窗口接单和完成备餐；重复操作幂等且禁止跳过状态。
     * @param id 当前窗口订单主键
     * @param ready false 接单开始备餐，true 备餐完成等待取餐
     * @return 更新后的预约
     * @throws com.sky.exception.BaseException 窗口不匹配或订单状态不允许迁移
     */
    @Transactional
    public OrderView advance(Long id, boolean ready) {
        mapper.lockOrder(id); OrderView order = mapper.order(id);
        require(order != null && catalog.managesWindow(order.getWindowId()), "预约不存在或不在当前管理范围");
        int target = ready ? 4 : 3;
        if (order.getStatus() == target) return full(order);
        require(order.getStatus() == target - 1 && order.getPayStatus() == 1, "当前状态无法执行此操作");
        orders.update(Orders.builder().id(id).status(target).build()); return full(mapper.order(id));
    }

    /**
     * 在授权窗口范围查找取餐凭证并锁定订单，仅待取餐状态可以核销；重复核销明确拒绝。
     * @param code 学生出示的八位取餐凭证
     * @return 已取餐预约与核销时间
     * @throws com.sky.exception.BaseException 凭证格式错误、窗口不匹配或已核销
     */
    @Transactional
    public OrderView pickup(String code) {
        require(code != null && code.trim().toUpperCase().matches("[A-Z2-9]{8}"), "请输入八位取餐码");
        Long id = mapper.orderByCode(catalog.staffWindow(), code.trim().toUpperCase());
        require(id != null, "本窗口没有找到这个取餐码");
        mapper.lockOrder(id); OrderView order = mapper.order(id);
        require(order.getStatus() == 4 && order.getPayStatus() == 1, "预约尚未备好或已经核销，请勿重复取餐");
        orders.update(Orders.builder().id(id).status(Orders.COMPLETED).deliveryTime(now()).build());
        mapper.markPickedUp(id); redis.delete(CampusCatalogService.MENU_KEY);
        return full(mapper.order(id));
    }

    /**
     * 定时任务处理超时未支付预约，与支付竞争同一订单行锁；已支付订单保持原状态。
     * @param id 候选未支付订单主键
     */
    @Transactional
    public void expire(Long id) {
        mapper.lockOrder(id); OrderView order = mapper.order(id);
        if (order != null && order.getStatus() == 1 && order.getOrderTime().isBefore(now().minusMinutes(15))) cancelLocked(order, "15 分钟未支付，预约自动取消");
    }

    /** 取得本人订单的排他锁后再判断所有权，外部传入主键不能绕过身份隔离。 */
    private OrderView ownedLocked(Long id) {
        require(id != null, "请选择预约"); mapper.lockOrder(id); OrderView order = mapper.order(id);
        require(order != null && BaseContext.getCurrentId().equals(order.getUserId()), "预约不存在"); return order;
    }

    /** 与下单保持相同的时段、菜品锁顺序，释放资源并将取消状态一次性落库。 */
    private void cancelLocked(OrderView order, String reason) {
        mapper.lockSlot(order.getSlotId());
        List<OrderDetail> lines = details.getByOrderId(order.getId());
        lines.sort(Comparator.comparing(OrderDetail::getDishId));
        for (OrderDetail line : lines) mapper.restoreStock(line.getDishId(), line.getNumber());
        mapper.releaseSlot(order.getSlotId());
        orders.update(Orders.builder().id(order.getId()).status(Orders.CANCELLED)
                .payStatus(order.getPayStatus() == 1 ? Orders.REFUND : Orders.UN_PAID).cancelReason(reason).cancelTime(now()).build());
        catalog.invalidateMenu();
    }

    /** 使用原明细 Mapper 补齐订单快照，不从前端接收菜价或已支付状态。 */
    private OrderView full(OrderView order) { if (order != null) order.setItems(details.getByOrderId(order.getId())); return order; }

    /** 使用安全随机数生成不易混淆的取餐码，由数据库唯一约束防止重复凭证。 */
    private String pickupCode() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; StringBuilder result = new StringBuilder();
        for (int i = 0; i < 8; i++) result.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        return result.toString();
    }

    /** 所有校园业务使用上海本地时间，与预约日期和界面保持一致。 */
    private LocalDateTime now() { return LocalDateTime.now(CampusCatalogService.ZONE); }
}
