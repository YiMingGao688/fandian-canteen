package com.sky.campus;

import com.sky.campus.CampusModels.Account;
import com.sky.mapper.CampusMapper;
import com.sky.utils.JwtUtil;
import io.jsonwebtoken.Claims;
import org.apache.shiro.authc.*;
import org.apache.shiro.authz.AuthorizationInfo;
import org.apache.shiro.authz.SimpleAuthorizationInfo;
import org.apache.shiro.realm.AuthorizingRealm;
import org.apache.shiro.subject.PrincipalCollection;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 使用原 JWT 工具验签，由 Shiro 再校验账号状态与数据库中的真实角色。 */
@Component
public class CampusRealm extends AuthorizingRealm {
    private final CampusMapper mapper;
    private final String secret;

    public CampusRealm(CampusMapper mapper, @Value("${campus.jwt-secret}") String secret) {
        this.mapper = mapper;
        this.secret = secret;
        setAuthenticationCachingEnabled(false);
        setAuthorizationCachingEnabled(false);
    }

    @Override
    public boolean supports(AuthenticationToken token) { return token instanceof CampusToken; }

    /** JWT 过期、签名错误、账号停用均拒绝；不信任客户端声称的角色。 */
    @Override
    protected AuthenticationInfo doGetAuthenticationInfo(AuthenticationToken token) throws AuthenticationException {
        try {
            Claims claims = JwtUtil.parseJWT(secret, token.getCredentials().toString());
            if (!"campus".equals(claims.get("scope"))) throw new AuthenticationException("令牌类型不匹配");
            Account account = mapper.accountByUser(Long.valueOf(claims.get("uid").toString()));
            if (account == null || !Integer.valueOf(1).equals(account.getEnabled())) throw new AuthenticationException("账号不可用");
            account.setPasswordHash(null);
            return new SimpleAuthenticationInfo(account, token.getCredentials(), getName());
        } catch (Exception ex) {
            throw new AuthenticationException("登录已失效，请重新登录");
        }
    }

    /** 权限来自持久化账号，只授予学生或其所属窗口工作人员角色。 */
    @Override
    protected AuthorizationInfo doGetAuthorizationInfo(PrincipalCollection principals) {
        Account account = (Account) principals.getPrimaryPrincipal();
        SimpleAuthorizationInfo info = new SimpleAuthorizationInfo();
        info.addRole(account.getRole());
        return info;
    }

    /** Shiro 认证令牌；凭证是已由 Realm 验签的校园 JWT。 */
    public static final class CampusToken implements AuthenticationToken {
        private final String value;
        public CampusToken(String value) { this.value = value; }
        @Override public Object getPrincipal() { return value; }
        @Override public Object getCredentials() { return value; }
    }
}
