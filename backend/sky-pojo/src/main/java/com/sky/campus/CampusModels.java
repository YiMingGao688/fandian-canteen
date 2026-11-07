package com.sky.campus;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.sky.entity.OrderDetail;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 校园扩展的请求和查询结果；原有菜品、购物车和订单实体保持复用。 */
public final class CampusModels {
    private CampusModels() { }

    @Data
    public static class Account implements Serializable {
        /** 对应原 user 表主键，用于隔离学生购物车和订单。 */
        private Long userId;
        /** 学生学号或窗口工作账号，不保存微信身份信息。 */
        private String username;
        /** PBKDF2 密码摘要，仅供服务端校验，不返回到客户端。 */
        @JsonIgnore private String passwordHash;
        /** 账号显示名称，来自注册信息。 */
        private String displayName;
        /** STUDENT 学生、STAFF 窗口人员、ADMIN 全校管理员、SCREEN 只读大屏。 */
        private String role;
        /** 窗口人员允许操作的食堂窗口，学生为空。 */
        private Long windowId;
        /** 账号状态，1 可使用，0 已停用。 */
        private Integer enabled;
    }

    @Data
    public static class LoginRequest {
        /** 登录学号或工作账号。 */ private String username;
        /** 用户本次输入的密码，不进入日志与数据库明文列。 */ private String password;
        /** 新注册学生的称呼，登录时忽略。 */ private String displayName;
    }

    @Data
    public static class LoginResult {
        /** 附带过期时间的 JWT，供后续校园接口认证。 */ private String token;
        /** 当前账号的可公开资料，不包含密码摘要。 */ private Account account;
    }

    @Data
    public static class Window implements Serializable {
        /** 食堂窗口主键。 */ private Long id;
        /** 食堂名称。 */ private String canteenName;
        /** 窗口名称。 */ private String name;
        /** 取餐位置。 */ private String location;
        /** 窗口简介。 */ private String description;
        /** 每个预约时段允许接收的订单数。 */ private Integer capacity;
        /** 对外展示的营业时间说明。 */ private String openingHours;
        /** 1 开放预约，0 暂停。 */ private Integer enabled;
    }

    @Data
    public static class DishView implements Serializable {
        /** 复用原 dish 表主键。 */ private Long id;
        /** 菜品名称。 */ private String name;
        /** 原 category 表分类主键。 */ private Long categoryId;
        /** 供筛选显示的分类名。 */ private String categoryName;
        /** 以元为单位的当前单价，结算以服务端查询为准。 */ private BigDecimal price;
        /** 菜品图片的本地资源地址。 */ private String image;
        /** 菜品介绍。 */ private String description;
        /** 上下架状态，1 在售，0 下架。 */ private Integer status;
        /** 所属窗口主键。 */ private Long windowId;
        /** 所属窗口名称。 */ private String windowName;
        /** 所属食堂名称。 */ private String canteenName;
        /** 尚可售出的份数，下单时使用原子扣减再次校验。 */ private Integer stock;
        /** 一份菜品的能量，单位千卡，仅为演示菜谱估算值。 */ private Integer calories;
        /** 口味、营养等展示标签。 */ private String tags;
        /** 已核销订单形成的销量。 */ private Long sold;
        /** 已购评价的平均星级，没有评价时为空。 */ private BigDecimal rating;
    }

    @Data
    public static class Slot implements Serializable {
        /** 单日窗口预约时段主键。 */ private Long id;
        /** 所属食堂窗口。 */ private Long windowId;
        /** 预约日期，采用上海时区。 */ private LocalDate serviceDate;
        /** 建议取餐时段起点。 */ private String startTime;
        /** 建议取餐时段终点。 */ private String endTime;
        /** 当前时段总名额。 */ private Integer capacity;
        /** 当前已占用的订单名额，取消时归还。 */ private Integer reserved;
    }

    @Data
    public static class CartChange {
        /** 要调整的原菜品主键。 */ private Long dishId;
        /** 调整量，只允许 1 或 -1。 */ private Integer delta;
    }

    @Data
    public static class SubmitRequest {
        /** 服务端发布的预约时段主键，决定取餐窗口和日期。 */ private Long slotId;
        /** 去重标识，网络重试时返回同一订单。 */ private String requestId;
        /** 用户点餐备注，最长 100 字。 */ private String remark;
        /** 是否需要餐具，默认提供一份。 */ private Boolean needCutlery;
    }

    @Data
    public static class OrderView implements Serializable {
        /** 复用原 orders 表主键。 */ private Long id;
        /** 对外展示的订单号。 */ private String number;
        /** 1 待支付，2 待接单，3 备餐中，4 待取餐，5 已取餐，6 已取消。 */ private Integer status;
        /** 当前订单所有者。 */ @JsonIgnore private Long userId;
        /** 学生显示名称。 */ private String studentName;
        /** 学生学号，仅返回给本人及所属窗口人员。 */ private String studentNo;
        /** 服务端计算的订单总价，单位元。 */ private BigDecimal amount;
        /** 原订单支付状态，0 未支付，1 已支付，2 已退回演示支付状态。 */ private Integer payStatus;
        /** 原订单支付渠道，服务端取消与退款规则使用，不向前端暴露。 */ @JsonIgnore private Integer payMethod;
        /** 订单创建时间。 */ private LocalDateTime orderTime;
        /** 原订单的取消说明。 */ private String cancelReason;
        /** 窗口拒单时保存的原因，来自原 orders.rejection_reason。 */ private String rejectionReason;
        /** 支付渠道说明，demo 表示本地演示，alipay 表示支付宝沙箱，用于取消时展示退款去向。 */ private String paymentChannel;
        /** 取餐窗口主键。 */ private Long windowId;
        /** 所属食堂名称。 */ private String canteenName;
        /** 取餐窗口名称。 */ private String windowName;
        /** 食堂窗口位置。 */ private String location;
        /** 所选预约时段主键，用于取消时释放名额。 */ @JsonIgnore private Long slotId;
        /** 预约日期。 */ private LocalDate serviceDate;
        /** 建议取餐时段起点。 */ private String startTime;
        /** 建议取餐时段终点。 */ private String endTime;
        /** 支付后产生的取餐凭证，只能由所属窗口核销。 */ private String pickupCode;
        /** 是否由初始化程序写入的演示记录。 */ private Boolean demo;
        /** 实际核销时间，未核销时为空。 */ private LocalDateTime pickedUpAt;
        /** 用户备注。 */ private String remark;
        /** 下单时保存的原订单明细快照。 */ private List<OrderDetail> items;
        /** 已完成订单是否已经发表评价。 */ private Boolean reviewed;
    }

    @Data
    public static class PaymentStartView implements Serializable {
        /** demo 表示本地演示支付，alipay 表示跳转支付宝沙箱收银台。 */ private String mode;
        /** 仅沙箱模式返回的已签名支付宝 WAP 收银台地址。 */ private String redirectUrl;
        /** 仅演示模式返回的本地支付完成订单快照。 */ private OrderView order;
    }

    @Data
    public static class OrderRecord {
        /** 复用原 orders 主键。 */ private Long orderId;
        /** 订单所有者，参与请求标识的联合唯一约束。 */ private Long userId;
        /** 取餐窗口主键。 */ private Long windowId;
        /** 占用的单日预约时段。 */ private Long slotId;
        /** 用户请求的幂等去重标识。 */ private String requestId;
        /** 支付后生成的随机取餐凭证。 */ private String pickupCode;
        /** 演示初始化记录标记。 */ private Boolean demo;
    }

    @Data
    public static class ReviewRequest {
        /** 学生已取餐订单的主键。 */ private Long orderId;
        /** 用户给出的 1 至 5 星评分。 */ private Integer rating;
        /** 评价文字，最多 300 字。 */ private String content;
    }

    @Data
    public static class FeedbackRequest {
        /** 反馈面向的食堂窗口，回复权限限定在该窗口。 */ private Long windowId;
        /** 学生的服务建议或问题描述，最多 500 字。 */ private String content;
    }

    @Data
    public static class FeedbackReply {
        /** 需要回复的反馈主键。 */ private Long id;
        /** 窗口回复内容，最多 500 字。 */ private String reply;
    }

    @Data
    public static class PickupRequest {
        /** 窗口人员输入的八位取餐凭证。 */ private String code;
    }

    @Data
    public static class DishChange {
        /** 当前窗口允许维护的菜品主键。 */ private Long id;
        /** 调整后的库存，不能小于零；不传时保留锁内最新库存。 */ private Integer stock;
        /** 上下架状态，只允许 0 或 1；不传时保持原状态。 */ private Integer status;
        /** 调整后的单价，必须大于零；不传时保持原价。 */ private BigDecimal price;
    }

    @Data
    public static class DishSave {
        /** 菜品名称，沿用原表全局唯一约束，最多 32 字。 */ private String name;
        /** 启用中的菜品分类主键，不接受套餐分类。 */ @JsonDeserialize(using=CampusNumberDeserializer.LongValue.class) private Long categoryId;
        /** 菜品归属窗口；窗口账号只允许自己的窗口，编辑时不能迁移归属。 */ @JsonDeserialize(using=CampusNumberDeserializer.LongValue.class) private Long windowId;
        /** 以元为单位的单价，0.01 至 999，最多两位小数。 */ private BigDecimal price;
        /** 当前剩余可售份数，0 至 10000；编辑时只提交实际修改的库存。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer stock;
        /** 菜单图片，由校园图片上传接口返回；编辑时可保留原图。 */ private String image;
        /** 菜品介绍，最多 255 字。 */ private String description;
        /** 上下架状态，0 下架，1 在售；新增默认下架。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer status;
        /** 每份能量估算，单位千卡，0 表示未填写。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer calories;
        /** 逗号分隔的展示标签，最多 100 字。 */ private String tags;
    }

    @Data
    public static class MenuCategory {
        /** 原 category 表主键，仅查询 type=1 的菜品分类。 */ private Long id;
        /** 分类名称，沿用原表全局唯一约束，最多 32 字。 */ private String name;
        /** 展示排序，数值越小越靠前。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer sort;
        /** 1 启用，0 停用；停用后不可用于新增或更换分类。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer status;
        /** 当前分类被原 dish 表引用的菜品数量，用于删除保护。 */ private Long dishCount;
    }

    @Data
    public static class MenuOptions {
        /** 当前账号允许管理的窗口，窗口账号只返回绑定窗口。 */ private List<Window> windows;
        /** 管理员可维护所有菜品分类，窗口账号仅取得启用分类。 */ private List<MenuCategory> categories;
    }

    @Data
    public static class ImageUpload {
        /** 上传成功后可供学生端、管理端共同访问的同源图片地址。 */ private String url;
    }
}
