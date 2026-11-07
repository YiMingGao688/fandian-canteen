package com.sky.campus;

import javax.crypto.SecretKeyFactory;
import javax.crypto.Mac;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** 使用独立随机盐与 PBKDF2 保存校园账号密码；不使用原案例的明文密码。 */
public final class CampusPassword {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int ITERATIONS = 210000;
    private CampusPassword() { }

    /** 将密码转换为带参数与随机盐的摘要，供校园账号创建和初始化使用。 */
    public static String hash(String password) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return ITERATIONS + "$" + Base64.getEncoder().encodeToString(salt) + "$"
                + Base64.getEncoder().encodeToString(derive(password, salt, ITERATIONS));
    }

    /** 以恒定时间比较派生密钥；格式错误的数据库摘要按认证失败处理。 */
    public static boolean matches(String password, String encoded) {
        if (password == null || encoded == null) return false;
        try {
            String[] parts = encoded.split("\\$");
            int rounds = Integer.parseInt(parts[0]);
            if (parts.length != 3 || rounds < 100000 || rounds > 1000000) return false;
            byte[] actual = derive(password, Base64.getDecoder().decode(parts[1]), rounds);
            return MessageDigest.isEqual(actual, Base64.getDecoder().decode(parts[2]));
        } catch (RuntimeException ex) {
            return false;
        }
    }

    /** 用服务端密钥绑定用户、密码和授权范围；重置密码、调岗或更换窗口后，旧令牌均失效。 */
    public static String version(String secret,Long userId,String encoded,String role,Long windowId) {
        try {
            Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal((userId+":"+encoded+":"+role+":"+windowId).getBytes(StandardCharsets.UTF_8)));
        }catch(Exception ex){throw new IllegalStateException("登录版本校验不可用",ex);}
    }

    /** 在 JDK 提供的算法中完成密码派生，使用后清除 PBE 参数内的密码字符。 */
    private static byte[] derive(String password, byte[] salt, int rounds) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, rounds, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception ex) {
            throw new IllegalStateException("密码摘要算法不可用", ex);
        } finally {
            spec.clearPassword();
        }
    }
}
