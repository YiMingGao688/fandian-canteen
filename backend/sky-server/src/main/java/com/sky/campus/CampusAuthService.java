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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** 校园学号注册登录；复用 user 主键及 JWT，不依赖微信账号和第三方密钥。 */
@Service
public class CampusAuthService {
    private final CampusMapper mapper;
    private final String secret;

    /** 所有失败路径返回相同文案，限速文案也只取决于失败次数，不体现账号是否存在。 */
    private static final String LOGIN_FAILURE = "账号或密码不正确";
    private static final String LOGIN_THROTTLED = "登录尝试过于频繁，请稍后再试";
    /** 同一账号 60 秒内连续失败 5 次后短暂拒绝，成功即清零；状态仅在内存中，重启或窗口到期即恢复。 */
    private static final int MAX_FAILURES = 5;
    private static final long FAILURE_WINDOW_MILLIS = 60_000L;
    private static final int MAX_TRACKED_KEYS = 4096;
    /** 与真实摘要同参数的占位值；账号不存在时也执行等价 PBKDF2 派生，消除响应时间差。 */
    private static final String DUMMY_HASH = "210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private final ConcurrentMap<String, Failures> failedLogins = new ConcurrentHashMap<>();

    /** 计数键按账号主键或规范化用户名生成，大小写变体不会绕开限速。 */
    private static final class Failures {
        private final long windowStart;
        private volatile int count;
        private Failures(long windowStart) { this.windowStart = windowStart; }
    }

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
     * 校验学号或工作账号的密码摘要并签发两小时 JWT。
     * 存在账号按 user_id 计数（数据库 collation 大小写不敏感，避免大小写变体绕过限速），
     * 不存在的账号按规范化用户名同样计数并做等价口令派生；两条路径的提示与耗时保持一致，
     * 不通过错误消息、限速状态或响应时间暴露账号是否存在。
     * @param request 登录账号和本次输入的密码
     * @return JWT 与数据库决定的角色资料
     * @throws BaseException 密码错误、账号不存在、账号已停用或短时间内失败次数过多
     */
    public LoginResult login(LoginRequest request) {
        validateCredentials(request);
        Account account = mapper.account(request.getUsername());
        String key = account == null
                ? "n:" + request.getUsername().toLowerCase(Locale.ROOT)
                : "u:" + account.getUserId();
        checkLoginThrottle(key);
        // 账号不存在或已停用时也执行一次等价派生，避免通过响应时间判断账号状态。
        String hash = account == null ? DUMMY_HASH : account.getPasswordHash();
        boolean passwordOk = CampusPassword.matches(request.getPassword(), hash);
        boolean enabled = account != null && Integer.valueOf(1).equals(account.getEnabled());
        if (!enabled || !passwordOk) {
            recordLoginFailure(key);
            throw new BaseException(LOGIN_FAILURE);
        }
        failedLogins.remove(key);
        return issue(account);
    }

    /** 超出失败次数且仍在时间窗内时拒绝本次尝试；窗口到期先清空该键再放行。
     *  窗口内即使口令正确也拒绝，避免攻击者在限速生效后继续试探。 */
    private void checkLoginThrottle(String key) {
        Failures state = failedLogins.get(key);
        if (state == null) return;
        long now = System.currentTimeMillis();
        if (now - state.windowStart >= FAILURE_WINDOW_MILLIS) { failedLogins.remove(key); return; }
        if (state.count >= MAX_FAILURES) throw new BaseException(LOGIN_THROTTLED);
    }

    /** 所有失败都计数；表满时腾出空间而不是放弃，真实账号的限速状态不会被刷表绕过。 */
    private void recordLoginFailure(String key) {
        long now = System.currentTimeMillis();
        if (failedLogins.size() >= MAX_TRACKED_KEYS / 2) evictExpired(now);
        boolean tracked = failedLogins.containsKey(key);
        if (!tracked && failedLogins.size() >= MAX_TRACKED_KEYS) makeRoom(key);
        if (!tracked && failedLogins.size() >= MAX_TRACKED_KEYS) return;
        failedLogins.compute(key, (ignored, value) -> {
            Failures current = value == null || now - value.windowStart >= FAILURE_WINDOW_MILLIS ? new Failures(now) : value;
            current.count++;
            return current;
        });
    }

    /** 只移除已超出时间窗的计数，保留仍在有效期内的限速状态。 */
    private void evictExpired(long now) {
        failedLogins.entrySet().removeIf(entry -> now - entry.getValue().windowStart >= FAILURE_WINDOW_MILLIS);
    }

    /**
     * 为新的真实账号键腾出空间：未知账号键优先淘汰，仍不足时按窗口起点淘汰最旧的一批。
     * 已存在的键永远不参与淘汰，因此任何账号的失败次数都能继续累加到限速阈值。
     */
    private void makeRoom(String key) {
        for (String existing : failedLogins.keySet()) {
            if (failedLogins.size() < MAX_TRACKED_KEYS) return;
            if (existing.startsWith("n:")) failedLogins.remove(existing);
        }
        if (key.startsWith("n:") || failedLogins.size() < MAX_TRACKED_KEYS) return;
        ArrayList<Map.Entry<String, Failures>> oldest = new ArrayList<>(failedLogins.entrySet());
        oldest.sort(Comparator.comparingLong(entry -> entry.getValue().windowStart));
        int evict = Math.min(oldest.size(), MAX_TRACKED_KEYS / 16);
        for (int i = 0; i < evict; i++) {
            Map.Entry<String, Failures> entry = oldest.get(i);
            failedLogins.remove(entry.getKey(), entry.getValue());
        }
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

    /** 令牌携带主键、校园作用域及密码/授权范围的密钥签名版本，不包含密码摘要或客户端可改写的角色。 */
    private LoginResult issue(Account account) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("uid", account.getUserId()); claims.put("scope", "campus");
        claims.put("credential", CampusPassword.version(secret,account.getUserId(),account.getPasswordHash(),account.getRole(),account.getWindowId()));
        LoginResult result = new LoginResult();
        result.setToken(JwtUtil.createJWT(secret, 7200000, claims));
        account.setPasswordHash(null); result.setAccount(account);
        return result;
    }
}
