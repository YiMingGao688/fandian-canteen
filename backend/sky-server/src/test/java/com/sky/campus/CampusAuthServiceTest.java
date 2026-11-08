package com.sky.campus;

import com.sky.campus.CampusModels.Account;
import com.sky.campus.CampusModels.LoginRequest;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentMap;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 校园登录限速与账号枚举防护；不依赖数据库或 Spring 上下文。 */
class CampusAuthServiceTest {

    private static final String SECRET = "unit-test-secret-0123456789";
    private static final String FAILURE = "账号或密码不正确";
    private static final String THROTTLED = "登录尝试过于频繁，请稍后再试";

    private LoginRequest request(String username, String password) {
        LoginRequest value = new LoginRequest();
        value.setUsername(username);
        value.setPassword(password);
        return value;
    }

    private Account account(String username, long userId) {
        Account value = new Account();
        value.setUserId(userId);
        value.setUsername(username);
        value.setDisplayName("Test");
        value.setRole("STUDENT");
        value.setEnabled(1);
        value.setPasswordHash(CampusPassword.hash("Campus@2026"));
        return value;
    }

    private List<String> failures(CampusAuthService service, LoginRequest request, int times) {
        List<String> messages = new ArrayList<>();
        for (int i = 0; i < times; i++) {
            messages.add(assertThrows(BaseException.class, () -> service.login(request)).getMessage());
        }
        return messages;
    }

    /** 数据库 collation 不区分大小写，大小写变体必须共享同一个 user_id 计数。 */
    @Test void caseVariantsShareOneCounter() {
        CampusMapper mapper = mock(CampusMapper.class);
        Account account = account("window01", 7L);
        when(mapper.account("window01")).thenReturn(account);
        when(mapper.account("WINDOW01")).thenReturn(account);
        when(mapper.account("Window01")).thenReturn(account);
        CampusAuthService service = new CampusAuthService(mapper, SECRET);

        String[] variants = {"window01", "WINDOW01", "Window01", "window01", "WINDOW01"};
        List<String> messages = new ArrayList<>();
        for (String variant : variants) {
            messages.add(assertThrows(BaseException.class,
                    () -> service.login(request(variant, "WrongPass123"))).getMessage());
        }
        assertEquals(List.of(FAILURE, FAILURE, FAILURE, FAILURE, FAILURE), messages);
        assertEquals(THROTTLED, assertThrows(BaseException.class,
                () -> service.login(request("Window01", "WrongPass123"))).getMessage());
    }

    /** 不存在的账号与真实账号失败序列完全一致，且同样被限速；不泄露账号存在性。 */
    @Test void unknownAccountHasIdenticalMessagesAndThrottle() {
        CampusMapper knownMapper = mock(CampusMapper.class);
        when(knownMapper.account("20260001")).thenReturn(account("20260001", 1L));
        CampusAuthService known = new CampusAuthService(knownMapper, SECRET);
        List<String> knownMessages = failures(known, request("20260001", "WrongPass123"), 6);

        CampusAuthService unknown = new CampusAuthService(mock(CampusMapper.class), SECRET);
        List<String> unknownMessages = failures(unknown, request("99999999", "WrongPass123"), 6);

        assertEquals(List.of(FAILURE, FAILURE, FAILURE, FAILURE, FAILURE, THROTTLED), knownMessages);
        assertEquals(knownMessages, unknownMessages);
    }

    /** 未达到限速阈值时成功登录清零计数，后续失败重新累计。 */
    @Test void successfulLoginClearsCounter() {
        CampusMapper mapper = mock(CampusMapper.class);
        when(mapper.account("20260001")).thenReturn(account("20260001", 1L));
        CampusAuthService service = new CampusAuthService(mapper, SECRET);
        failures(service, request("20260001", "WrongPass123"), 3);

        assertDoesNotThrow(() -> service.login(request("20260001", "Campus@2026")));
        assertEquals(List.of(FAILURE, FAILURE, FAILURE, FAILURE, FAILURE),
                failures(service, request("20260001", "WrongPass123"), 5));
        assertEquals(THROTTLED, assertThrows(BaseException.class,
                () -> service.login(request("20260001", "WrongPass123"))).getMessage());
    }

    /** 计数器达到上限时只放弃新增，不清空已有账号的限速状态。 */
    @Test void counterPressureDoesNotResetThrottle() throws Exception {
        CampusMapper mapper = mock(CampusMapper.class);
        when(mapper.account("20260001")).thenReturn(account("20260001", 1L));
        CampusAuthService service = new CampusAuthService(mapper, SECRET);
        failures(service, request("20260001", "WrongPass123"), 5);

        Field field = CampusAuthService.class.getDeclaredField("failedLogins");
        field.setAccessible(true);
        @SuppressWarnings("unchecked")
        ConcurrentMap<String, Object> counters = (ConcurrentMap<String, Object>) field.get(service);
        Class<?> failuresClass = Class.forName("com.sky.campus.CampusAuthService$Failures");
        Constructor<?> constructor = failuresClass.getDeclaredConstructor(long.class);
        constructor.setAccessible(true);
        long now = System.currentTimeMillis();
        for (int i = counters.size(); i < 4096; i++) counters.put("pad:" + i, constructor.newInstance(now));

        assertEquals(THROTTLED, assertThrows(BaseException.class,
                () -> service.login(request("20260001", "WrongPass123"))).getMessage());
        assertTrue(counters.containsKey("u:1"));
    }
}
