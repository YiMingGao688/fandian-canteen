package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.campus.CampusOperationsModels.*;
import com.sky.context.BaseContext;
import com.sky.entity.User;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusMapper;
import com.sky.mapper.CampusOperationsMapper;
import com.sky.result.PageResult;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import static com.sky.campus.CampusCatalogService.require;
import static com.sky.campus.CampusCatalogService.text;

/** 管理工作账号及窗口营业资料，沿用校园身份、PBKDF2 和既有表结构。 */
@Service
public class CampusOperationsService {
    private static final Set<String> ROLES=Set.of("ADMIN","STAFF","SCREEN");
    private final CampusMapper mapper;
    private final CampusOperationsMapper operations;
    private final CampusAuthService auth;
    private final CampusCatalogService catalog;

    public CampusOperationsService(CampusMapper mapper,CampusOperationsMapper operations,CampusAuthService auth,CampusCatalogService catalog) {
        this.mapper=mapper;this.operations=operations;this.auth=auth;this.catalog=catalog;
    }

    /**
     * 管理员分页查询工作账号，排除学生和密码摘要，关键词按字面含义匹配。
     * @param query 页码、数量、身份、状态及关键词
     * @return 总数及当前页公开工作资料
     * @throws BaseException 非管理员、页码/数量或筛选条件不合法
     */
    @Transactional(readOnly=true)
    public PageResult accounts(AccountQuery query) {
        administrator(); require(query!=null,"请提供查询条件"); pageBounds(query.getPage(),query.getPageSize());
        require(query.getRole()==null||query.getRole().isBlank()||ROLES.contains(query.getRole()),"请选择正确的工作身份");
        if(query.getRole()!=null&&query.getRole().isBlank())query.setRole(null);
        require(query.getEnabled()==null||query.getEnabled()==0||query.getEnabled()==1,"请选择正确的账号状态");
        query.setKeyword(keyword(query.getKeyword()));query.setOffset((long)(query.getPage()-1)*query.getPageSize());
        return new PageResult(operations.accountCount(query),operations.accountPage(query));
    }

    /**
     * 管理员创建或修改工作账号；学生身份不进入此流程，账号创建后不可改登录名。
     * 窗口人员必须绑定真实窗口，密码使用随机盐摘要；原 user 和校园身份在同一事务写入。
     * 自己的管理员身份和启用状态受保护，并串行校验始终至少有一个启用管理员。
     * @param id 编辑的用户主键，新增时为空
     * @param request 名称、工作身份、窗口及启用状态，新增还需初始密码
     * @return 不含密码摘要的工作账号资料
     * @throws BaseException 非管理员、字段非法、重名、学生主键或试图停用/降级当前管理员
     */
    @Transactional
    public Account saveAccount(Long id,AccountSave request) {
        administrator(); require(request!=null,"请填写账号资料");lockAdministrator();
        Account previous=id==null?null:operations.lockManagedAccount(id);require(id==null||previous!=null,"工作账号不存在");
        String username=text(request.getUsername(),24,"账号应为 3 至 24 位字母、数字、下划线或短横线");
        require(username.matches("[A-Za-z0-9_-]{3,24}"),"账号应为 3 至 24 位字母、数字、下划线或短横线");
        require(previous==null||previous.getUsername().equals(username),"登录账号创建后不能修改");
        String name=text(request.getDisplayName(),32,"显示名称应为 2 至 32 字");require(name.length()>=2,"显示名称应为 2 至 32 字");
        require(ROLES.contains(request.getRole()==null?"":request.getRole()),"请选择正确的工作身份");
        int enabled=request.getEnabled()==null?1:request.getEnabled();require(enabled==0||enabled==1,"请选择正确的账号状态");
        if("STAFF".equals(request.getRole())) require(request.getWindowId()!=null&&mapper.window(request.getWindowId())!=null,"窗口人员必须绑定真实窗口");
        else require(request.getWindowId()==null,"该工作身份不应绑定单一窗口");
        require(id==null||!id.equals(BaseContext.getCurrentId())||"ADMIN".equals(request.getRole())&&enabled==1,"不能停用或降级当前登录的管理员");
        Account result=new Account();result.setUsername(username);result.setDisplayName(name);result.setRole(request.getRole());result.setWindowId(request.getWindowId());result.setEnabled(enabled);
        try {
            if(previous==null){
                require(mapper.account(username)==null,"这个登录账号已被使用");validatePassword(request.getPassword());
                result.setPasswordHash(CampusPassword.hash(request.getPassword()));
                User user=User.builder().openid("campus:"+username).name(name).createTime(LocalDateTime.now(CampusCatalogService.ZONE)).build();mapper.insertUser(user);
                result.setUserId(user.getId());mapper.insertAccount(result);
            }else{result.setUserId(id);operations.updateAccount(result);operations.updateUserName(id,name);}
        }catch(DuplicateKeyException ex){throw new BaseException("这个登录账号已被使用");}
        require(operations.enabledAdministratorCount()>0,"至少保留一个启用中的管理员");result.setPasswordHash(null);return result;
    }

    /**
     * 管理员为工作账号重置密码；摘要变化后 Realm 会拒绝该账号全部旧令牌。
     * 不返回新密码，不允许借工作维护接口修改学生密码。
     * @param id 工作账号主键
     * @param request 8 至 64 位新密码
     * @throws BaseException 非管理员、账号不存在或密码长度不合规
     */
    @Transactional
    public void resetPassword(Long id,PasswordReset request) {
        administrator();require(id!=null&&request!=null,"请选择工作账号并填写新密码");validatePassword(request.getPassword());lockAdministrator();
        require(operations.lockManagedAccount(id)!=null,"工作账号不存在");operations.resetPassword(id,CampusPassword.hash(request.getPassword()));
    }

    /**
     * 返回当前管理范围内的完整窗口资料，管理员看全校，工作人员只看绑定窗口。
     * @return 允许维护的真实窗口列表
     * @throws BaseException 当前身份没有窗口管理权限
     */
    public List<Window> windows() {
        Long scope=catalog.staffWindow();return mapper.windows().stream().filter(window->scope==null||scope.equals(window.getId())).collect(Collectors.toList());
    }

    /**
     * 创建或维护窗口资料及营业状态；新增仅管理员可操作，窗口人员不能改所属食堂或其他窗口。
     * 营业区间用于后续预约校验，暂停营业不取消既有订单；容量作为新发布时段的默认值。
     * @param id 当前窗口主键，新增时为空
     * @param request 窗口介绍、位置、容量、营业时间和启停状态
     * @return 保存后的数据库窗口资料
     * @throws BaseException 越权、窗口不存在或字段超出原表限制、时间区间重叠
     */
    @Transactional
    public Window saveWindow(Long id,WindowSave request) {
        Long scope=catalog.staffWindow();require(request!=null,"请填写窗口资料");
        require(id!=null||scope==null,"只有全校管理员可以新增窗口");require(scope==null||Objects.equals(scope,id),"只能维护绑定的窗口");
        Window previous=id==null?null:mapper.window(id);require(id==null||previous!=null,"食堂窗口不存在");
        String canteen=text(request.getCanteenName(),40,"食堂名称应为 1 至 40 字");require(scope==null||previous.getCanteenName().equals(canteen),"窗口人员不能更换所属食堂");
        Window window=new Window();window.setId(id);window.setCanteenName(canteen);window.setName(text(request.getName(),40,"窗口名称应为 1 至 40 字"));
        window.setLocation(text(request.getLocation(),120,"取餐位置应为 1 至 120 字"));
        String description=request.getDescription()==null?"":request.getDescription().trim();require(description.length()<=240,"窗口介绍最多 240 字");window.setDescription(description);
        require(request.getCapacity()!=null&&request.getCapacity()>=1&&request.getCapacity()<=200,"每时段默认容量应为 1 至 200 笔");window.setCapacity(request.getCapacity());
        require(request.getEnabled()!=null&&(request.getEnabled()==0||request.getEnabled()==1),"请选择正确的营业状态");window.setEnabled(request.getEnabled());
        window.setOpeningHours(CampusHours.normalize(request.getOpeningHours()));
        if(id==null)operations.insertWindow(window);else operations.updateWindow(window);
        catalog.invalidateMenu();return mapper.window(window.getId());
    }

    /**
     * 管理员快速启停工作账号，锁内只修改状态，避免覆盖其他管理员刚调整的身份和绑定窗口。
     * @param id 工作账号主键
     * @param enabled 0 停用，1 启用
     * @throws BaseException 非管理员、账号不存在、状态非法或试图停用自己
     */
    @Transactional
    public void accountStatus(Long id,Integer enabled){
        administrator();require(enabled!=null&&(enabled==0||enabled==1),"请选择正确的账号状态");lockAdministrator();
        require(id!=null&&operations.lockManagedAccount(id)!=null,"工作账号不存在");require(!id.equals(BaseContext.getCurrentId())||enabled==1,"不能停用当前登录的管理员");
        operations.updateAccountEnabled(id,enabled);require(operations.enabledAdministratorCount()>0,"至少保留一个启用中的管理员");
    }

    /**
     * 按当前窗口范围切换是否开放预约，不改动既有订单、容量、营业时间或窗口资料。
     * @param id 当前管理范围的窗口主键
     * @param enabled 0 暂停预约，1 开放预约
     * @throws BaseException 越权、窗口不存在或启停状态不合法
     */
    @Transactional
    public void windowStatus(Long id,Integer enabled){
        require(id!=null&&catalog.managesWindow(id)&&mapper.window(id)!=null,"只能维护当前权限内的食堂窗口");
        require(enabled!=null&&(enabled==0||enabled==1),"请选择正确的营业状态");operations.updateWindowEnabled(id,enabled);catalog.invalidateMenu();
    }

    /** 验证全校管理员身份；不信任客户端提交的角色或前端按钮是否可见。 */
    private Account administrator() { Account account=auth.current();require("ADMIN".equals(account.getRole()),"只有全校管理员可以维护工作账号");return account; }
    /** 排队取得管理员锁后再用当前读确认操作者仍然启用，避免两个管理员并发互相停用后全部失去权限。 */
    private void lockAdministrator(){operations.lockAdministrators();Account current=operations.lockManagedAccount(BaseContext.getCurrentId());require(current!=null&&"ADMIN".equals(current.getRole())&&Integer.valueOf(1).equals(current.getEnabled()),"管理权限已变化，请重新登录");}
    /** 密码约束与现有登录流程一致，避免创建无法通过原登录校验的账号。 */
    private void validatePassword(String password) {require(password!=null&&password.length()>=8&&password.length()<=64,"密码长度应为 8 至 64 位");}
    /** 控制单次查询开销和偏移量范围，数据库中不使用客户端提供的 offset。 */
    static void pageBounds(int page,int size){require(page>=1&&page<=1000000&&size>=1&&size<=50,"页码或每页数量不正确");}
    /** 限定查询文字长度并转义 LIKE 通配符，% 和下划线按文字搜索。 */
    static String keyword(String value){if(value==null||value.trim().isEmpty())return null;String term=text(value,80,"搜索内容最多 80 字");return term.replace("\\","\\\\").replace("%","\\%").replace("_","\\_");}
}
