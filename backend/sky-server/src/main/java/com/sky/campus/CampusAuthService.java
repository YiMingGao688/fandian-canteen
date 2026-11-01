package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.context.BaseContext;
import com.sky.entity.User;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusMapper;
import com.sky.utils.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/** 校园学号注册登录；复用 user 主键及 JWT，不依赖微信账号和第三方密钥。 */
@Service
public class CampusAuthService {
    private final CampusMapper mapper;
    private final String secret;

    public CampusAuthService(CampusMapper mapper, @Value("${campus.jwt-secret}") String secret) {
        this.mapper = mapper;
        this.secret = secret;
    }

    /**
     * 注册学生账号：校验学号与密码，创建原用户记录，并以加盐摘要保存校园身份。
     * 对外注册只能生成 STUDENT 角色，窗口工作账号由初始化或管理流程分配。
     * @param request 学号、密码和显示名称
     * @return 注册成功后可直接使用的 JWT 与公开账号资料
     * @throws BaseException 学号、密码不符合规则或学号已被使用
     */
    @Transactional
    public LoginResult register(LoginRequest request) {
        validateCredentials(request);
        if (!request.getUsername().matches("[0-9]{8,16}")) throw new BaseException("学号需为 8 至 16 位数字");
        if (request.getDisplayName() == null || request.getDisplayName().trim().length() < 2 || request.getDisplayName().trim().length() > 24) throw new BaseException("请填写 2 至 24 字的称呼");
        if (mapper.account(request.getUsername()) != null) throw new BaseException("这个学号已经注册，请直接登录");
        User user = User.builder().openid("campus:" + request.getUsername()).name(request.getDisplayName().trim()).createTime(LocalDateTime.now()).build();
        mapper.insertUser(user);
        Account account = new Account();
        account.setUserId(user.getId()); account.setUsername(request.getUsername());
        account.setPasswordHash(CampusPassword.hash(request.getPassword())); account.setDisplayName(user.getName());
        account.setRole("STUDENT"); account.setEnabled(1);
        mapper.insertAccount(account);
        return issue(account);
    }

    /**
     * 校验学号或工作账号的密码摘要并签发两小时 JWT；错误消息不暴露账号是否存在。
     * @param request 登录账号和本次输入的密码
     * @return JWT 与数据库决定的角色资料
     * @throws BaseException 密码错误、账号不存在或账号已停用
     */
    public LoginResult login(LoginRequest request) {
        validateCredentials(request);
        Account account = mapper.account(request.getUsername());
        if (account == null || !Integer.valueOf(1).equals(account.getEnabled()) || !CampusPassword.matches(request.getPassword(), account.getPasswordHash())) throw new BaseException("账号或密码不正确");
        return issue(account);
    }

    /**
     * 读取拦截器已经认证的当前用户，并返回可公开的校园身份。
     * @return 当前账号资料，密码摘要不会序列化
     * @throws BaseException 身份缺失或账号已不可用
     */
    public Account current() {
        Long id = BaseContext.getCurrentId();
        Account account = id == null ? null : mapper.accountByUser(id);
        if (account == null || !Integer.valueOf(1).equals(account.getEnabled())) throw new BaseException("登录已失效");
        account.setPasswordHash(null);
        return account;
    }

    /** 限制输入长度，避免密码派生前接收过大的请求字段。 */
    private void validateCredentials(LoginRequest request) {
        if (request == null || request.getUsername() == null || !request.getUsername().trim().matches("[A-Za-z0-9_-]{3,24}")) throw new BaseException("请填写有效的学号或工作账号");
        request.setUsername(request.getUsername().trim());
        if (request.getPassword() == null || request.getPassword().length() < 8 || request.getPassword().length() > 64) throw new BaseException("密码长度应为 8 至 64 位");
    }

    /** 令牌仅承载用户主键和校园作用域，不包含密码、手机号和客户端可改写的角色。 */
    private LoginResult issue(Account account) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("uid", account.getUserId()); claims.put("scope", "campus");
        LoginResult result = new LoginResult();
        result.setToken(JwtUtil.createJWT(secret, 7200000, claims));
        account.setPasswordHash(null); result.setAccount(account);
        return result;
    }
}
