package com.sky.campus;

import com.sky.campus.CampusModels.Account;
import com.sky.context.BaseContext;
import com.sky.json.JacksonObjectMapper;
import com.sky.result.Result;
import org.apache.shiro.mgt.DefaultSecurityManager;
import org.apache.shiro.mgt.DefaultSessionStorageEvaluator;
import org.apache.shiro.mgt.DefaultSubjectDAO;
import org.apache.shiro.subject.Subject;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/** 沿用项目 MVC 拦截方式；校园请求不创建 Shiro Session，并清理线程身份。 */
@Component
public class CampusAuthInterceptor implements HandlerInterceptor {
    private final DefaultSecurityManager securityManager;

    public CampusAuthInterceptor(CampusRealm realm) {
        securityManager = new DefaultSecurityManager(realm);
        DefaultSessionStorageEvaluator evaluator = new DefaultSessionStorageEvaluator();
        evaluator.setSessionStorageEnabled(false);
        DefaultSubjectDAO dao = new DefaultSubjectDAO();
        dao.setSessionStorageEvaluator(evaluator);
        securityManager.setSubjectDAO(dao);
    }

    /** 公开菜谱和认证接口放行；受保护路径必须通过 JWT 和 Shiro 角色验证。 */
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        BaseContext.removeCurrentId();
        String path = request.getRequestURI();
        if (path.startsWith("/campus/public/") || path.startsWith("/campus/auth/")) return true;
        String header = request.getHeader("Authorization");
        try {
            if (header == null || !header.startsWith("Bearer ")) throw new IllegalArgumentException();
            Subject subject = new Subject.Builder(securityManager).sessionCreationEnabled(false).buildSubject();
            subject.login(new CampusRealm.CampusToken(header.substring(7)));
            if (path.startsWith("/campus/staff/") && !subject.hasRole("STAFF") && !subject.hasRole("ADMIN")) throw new org.apache.shiro.authz.UnauthorizedException();
            // 独立大屏只允许管理员和只读展示账号，展示账号不能进入管理写接口。
            if (path.startsWith("/campus/screen/") && !subject.hasRole("ADMIN") && !subject.hasRole("SCREEN")) throw new org.apache.shiro.authz.UnauthorizedException();
            if (path.startsWith("/campus/student/")) subject.checkRole("STUDENT");
            Account account = (Account) subject.getPrincipal();
            BaseContext.setCurrentId(account.getUserId());
            request.setAttribute("campus.account", account);
            return true;
        } catch (org.apache.shiro.authz.AuthorizationException ex) {
            response.setStatus(403);
            writeError(response, "当前账号没有此操作权限");
        } catch (Exception ex) {
            response.setStatus(401);
            writeError(response, "请先登录后再继续操作");
        }
        return false;
    }

    /** 每次请求结束都释放 ThreadLocal，防止线程复用造成身份串用。 */
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        BaseContext.removeCurrentId();
    }

    private void writeError(HttpServletResponse response, String message) throws Exception {
        response.setContentType("application/json;charset=UTF-8");
        new JacksonObjectMapper().writeValue(response.getWriter(), Result.error(message));
    }
}
