package com.sky.mapper;

import com.sky.campus.CampusModels.*;
import com.sky.campus.CampusOperationsModels.*;
import com.sky.entity.OrderDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 运营维护 SQL；所有窗口权限和状态规则先经 Service 校验，写入沿用原表结构。 */
@Mapper
public interface CampusOperationsMapper {
    /** 统计工作账号数量，明确排除学生身份。 */
    long accountCount(@Param("query") AccountQuery query);
    /** 分页返回可管理工作账号，不查询或返回密码摘要。 */
    List<ManagedAccount> accountPage(@Param("query") AccountQuery query);
    /** 串行化管理员身份变更，避免并发操作移除最后一个可用管理员。 */
    List<Long> lockAdministrators();
    /** 锁定指定工作账号，不允许通过该接口操作学生账号。 */
    Account lockManagedAccount(@Param("id") Long id);
    /** 更新工作身份、窗口绑定、显示名称和启用状态，登录账号保持原值。 */
    void updateAccount(Account account);
    /** 快速启停只更新状态，保留并发调整过的窗口、角色与显示资料。 */
    void updateAccountEnabled(@Param("id") Long id,@Param("enabled") int enabled);
    /** 同步原 user 表的显示名称，不修改身份主键或关联订单。 */
    void updateUserName(@Param("id") Long id, @Param("name") String name);
    /** 仅替换密码摘要；认证版本由摘要变化自动失效，不存储明文密码。 */
    void resetPassword(@Param("id") Long id, @Param("passwordHash") String passwordHash);
    /** 统计仍启用的管理员，供权限变更保护使用。 */
    int enabledAdministratorCount();
    /** 创建食堂窗口并回填实际数据库主键。 */
    void insertWindow(Window window);
    /** 更新真实窗口资料和营业状态，不删除历史订单或既有时段。 */
    void updateWindow(Window window);
    /** 营业开关只写启停字段，不携带页面上可能已经过期的营业时间和容量。 */
    void updateWindowEnabled(@Param("id") Long id,@Param("enabled") int enabled);
    /** 统计完整校园历史订单，所有条件都使用绑定参数。 */
    long orderCount(@Param("query") OrderQuery query);
    /** 查询当前授权范围的一页订单，优先按备餐状态、取餐截止时间排序。 */
    List<OrderView> orderPage(@Param("query") OrderQuery query);
    /** 一次读取当前页订单的菜品快照，避免逐单查询明细。 */
    List<OrderDetail> pageOrderDetails(@Param("ids") List<Long> ids);
}
