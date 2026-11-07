package com.sky.campus;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import lombok.Data;
import lombok.ToString;
import java.time.LocalDateTime;

/** 运营维护和历史查询的请求及返回模型，字段对应既有校园账号、窗口和订单表。 */
public final class CampusOperationsModels {
    private CampusOperationsModels() { }

    @Data
    public static class AccountSave {
        /** 工作登录账号，3 至 24 位字母、数字、下划线或短横线；创建后保持不变。 */ private String username;
        /** 工作人员显示名称，2 至 32 字，同时同步原 user.name。 */ private String displayName;
        /** 工作身份，仅允许 ADMIN、STAFF 或 SCREEN，不能通过管理接口修改学生身份。 */ private String role;
        /** STAFF 必须绑定的窗口主键；其他工作身份为空。 */ @JsonDeserialize(using=CampusNumberDeserializer.LongValue.class) private Long windowId;
        /** 1 启用、0 停用；停用后已有令牌也无法通过身份校验。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer enabled;
        /** 新账号初始密码，仅写入请求，不序列化、不写日志；编辑资料时忽略。 */
        @JsonProperty(access=JsonProperty.Access.WRITE_ONLY) @ToString.Exclude private String password;
    }

    @Data
    public static class ManagedAccount {
        /** 原 user 表及 campus_account 共用的主键。 */ private Long userId;
        /** 不可修改的工作登录账号。 */ private String username;
        /** 人员在管理页面显示的名称，不包含密码摘要。 */ private String displayName;
        /** 数据库中的 ADMIN、STAFF 或 SCREEN 身份。 */ private String role;
        /** 窗口人员的授权窗口主键。 */ private Long windowId;
        /** 账号当前启用状态。 */ private Integer enabled;
        /** 关联窗口名称，未绑定窗口时为空。 */ private String windowName;
        /** 关联窗口所属食堂，未绑定窗口时为空。 */ private String canteenName;
        /** 原 user 表记录的账号创建时间。 */ private LocalDateTime createTime;
    }

    @Data
    public static class AccountQuery {
        /** 从 1 开始的服务端页码。 */ private int page = 1;
        /** 每页数量，1 至 50。 */ private int pageSize = 6;
        /** 按账号、人员名称、食堂或窗口名称搜索的文字，最多 80 字。 */ private String keyword;
        /** 可选工作身份筛选，不接受 STUDENT。 */ private String role;
        /** 可选启用状态筛选，0 或 1。 */ private Integer enabled;
        /** 服务层校验后计算的 SQL 分页偏移量，不采信请求传入值。 */ private long offset;
    }

    @Data
    public static class PasswordReset {
        /** 管理员设置的新密码，8 至 64 位；重置后该账号旧令牌失效。 */
        @JsonProperty(access=JsonProperty.Access.WRITE_ONLY) @ToString.Exclude private String password;
    }

    @Data
    public static class WindowSave {
        /** 食堂名称，最多 40 字；窗口工作人员不能更改所属食堂。 */ private String canteenName;
        /** 窗口显示名称，最多 40 字。 */ private String name;
        /** 学生实际取餐位置，最多 120 字。 */ private String location;
        /** 窗口介绍，最多 240 字，可清空。 */ private String description;
        /** 新发布时段的默认预约容量，1 至 200；既有时段及预约保持原容量。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer capacity;
        /** 当天营业时间，格式 HH:mm-HH:mm，多个时段用 / 分隔，不跨午夜。 */ private String openingHours;
        /** 1 开放预约、0 暂停；暂停不阻止处理已生成的订单。 */ @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer enabled;
    }

    @Data
    public static class OrderQuery {
        /** 从 1 开始的服务端页码，不能通过偏移量绕过数量上限。 */ private int page = 1;
        /** 每页数量，1 至 50，按页面可用行数传入。 */ private int pageSize = 6;
        /** active 表示待接单、备餐和待取餐；all 表示全部；也可为 1 至 6 的单一状态。 */ private String state = "active";
        /** 学生名称、学号、订单号、菜品或窗口关键词，最多 80 字。 */ private String keyword;
        /** 可选取餐开始日期，服务层严格校验 yyyy-MM-dd。 */ private String fromDate;
        /** 可选取餐结束日期，包含当天；不能早于开始日期。 */ private String toDate;
        /** 管理员可选窗口；窗口工作人员在服务层强制限定为绑定窗口。 */ private Long windowId;
        /** 服务层根据已校验页码计算的 SQL 偏移量。 */ private long offset;
    }

    @Data
    public static class OperationReason {
        /** 拒单或管理取消的原因，1 至 200 字，保存到原订单取消/拒绝说明字段。 */ private String reason;
    }

    @Data
    public static class EnabledChange {
        /** 仅更新启停状态，0 停用/暂停，1 启用/开放；不携带旧资料覆盖并发修改。 */
        @JsonDeserialize(using=CampusNumberDeserializer.IntValue.class) private Integer enabled;
    }
}
