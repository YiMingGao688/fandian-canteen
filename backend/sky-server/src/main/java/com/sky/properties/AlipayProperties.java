package com.sky.properties;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** 支付宝沙箱配置；密钥只从本机运行环境注入，不写入仓库配置。 */
@Data
@Component
@ConfigurationProperties(prefix = "campus.alipay")
public class AlipayProperties {
    /** 沙箱应用 APPID。 */
    private String appId = "";
    /** 应用 RSA 私钥，仅保存在本机受保护配置中。 */
    private String privateKey = "";
    /** 支付宝 RSA 公钥，用于验签。 */
    private String publicKey = "";
    /** 支付宝沙箱网关地址。 */
    private String gatewayUrl = "https://openapi.alipaydev.com/gateway.do";
    /** 支付宝可访问的异步通知地址。 */
    private String notifyUrl = "";
    /** 支付完成后返回手机 H5 的地址。 */
    private String returnUrl = "";

    /** 检查发起支付和校验通知必需的沙箱参数是否齐全。 */
    public boolean isReady() {
        return hasText(appId) && hasText(privateKey) && hasText(publicKey)
                && hasText(gatewayUrl) && hasText(notifyUrl) && hasText(returnUrl);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
