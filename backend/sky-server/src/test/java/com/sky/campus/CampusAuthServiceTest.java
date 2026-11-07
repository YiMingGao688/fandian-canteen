package com.sky.campus;

import com.sky.campus.CampusModels.Account;
import com.sky.campus.CampusModels.LoginRequest;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 校园登录口令失败限速；不依赖数据库或 Spring 上下文。 */
class CampusAuthServiceTest {

    private LoginRequest request(String username, String password) {
        LoginRequest value = new LoginRequest();
        value.setUsername(username);
        value.setPassword(password);
        return value;
    }

    @Test void throttlesRealAccountsOnly() {
        CampusMapper mapper = mock(CampusMapper.class);
        Account account = new Account();
        account.setUserId(1L);
        account.setUsername("20260001");
        account.setDisplayName("Test");
        account.setRole("STUDENT");
        account.setEnabled(1);
        account.setPasswordHash(CampusPassword.hash("Campus@2026"));
        when(mapper.account("20260001")).thenReturn(account);
        CampusAuthService service = new CampusAuthService(mapper, "unit-test-secret-0123456789");

        LoginRequest bad = request("20260001", "WrongPass123");
        for (int i = 0; i < 5; i++) {
            assertEquals("账号或密码不正确", assertThrows(BaseException.class, () -> service.login(bad)).getMessage());
        }
        assertTrue(assertThrows(BaseException.class, () -> service.login(bad)).getMessage().contains("频繁"));

        LoginRequest unknown = request("99999999", "WrongPass123");
        for (int i = 0; i < 8; i++) {
            assertEquals("账号或密码不正确", assertThrows(BaseException.class, () -> service.login(unknown)).getMessage());
        }

        LoginRequest good = request("20260001", "Campus@2026");
        assertTrue(assertThrows(BaseException.class, () -> service.login(good)).getMessage().contains("频繁"));
    }
}
