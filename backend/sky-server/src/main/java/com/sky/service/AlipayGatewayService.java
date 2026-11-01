package com.sky.service;

import com.alipay.api.AlipayApiException;
import com.alipay.api.AlipayClient;
import com.alipay.api.DefaultAlipayClient;
import com.alipay.api.domain.AlipayTradeRefundModel;
import com.alipay.api.domain.AlipayTradeWapPayModel;
import com.alipay.api.request.AlipayTradeRefundRequest;
import com.alipay.api.request.AlipayTradeWapPayRequest;
import com.alipay.api.response.AlipayTradeRefundResponse;
import com.alipay.api.response.AlipayTradeWapPayResponse;
import com.alipay.api.internal.util.AlipaySignature;
import com.sky.campus.CampusModels.OrderView;
import com.sky.exception.BaseException;
import com.sky.properties.AlipayProperties;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/** 支付宝沙箱网关适配层，集中处理 WAP 签名请求、异步通知验签和退款。 */
@Service
public class AlipayGatewayService {
    private final AlipayProperties properties;
    private volatile AlipayClient client;

    public AlipayGatewayService(AlipayProperties properties) {
        this.properties = properties;
    }

    /**
     * 根据服务端订单快照生成手机网站支付的已签名 GET 跳转地址。
     * 请求金额与订单号均取自数据库，客户端不能传入或覆盖。
     * @param order 已校验所有权、状态和支付期限的订单
     * @return 支付宝沙箱收银台地址
     * @throws BaseException 沙箱配置缺失或支付宝 SDK 签名失败
     */
    public String createWapPaymentUrl(OrderView order) {
        AlipayTradeWapPayRequest request = new AlipayTradeWapPayRequest();
        request.setNotifyUrl(properties.getNotifyUrl());
        request.setReturnUrl(properties.getReturnUrl());
        AlipayTradeWapPayModel model = new AlipayTradeWapPayModel();
        model.setOutTradeNo(order.getNumber());
        model.setTotalAmount(order.getAmount().setScale(2, RoundingMode.HALF_UP).toPlainString());
        model.setSubject("禾序食堂预约订单");
        model.setBody("食堂预约取餐");
        model.setProductCode("QUICK_WAP_WAY");
        model.setTimeoutExpress("15m");
        request.setBizModel(model);
        try {
            AlipayTradeWapPayResponse response = client().pageExecute(request, "GET");
            String redirectUrl = response.getBody();
            if (redirectUrl == null || !redirectUrl.startsWith(properties.getGatewayUrl())) {
                throw new BaseException("支付宝未生成有效的沙箱支付地址");
            }
            return redirectUrl;
        } catch (AlipayApiException ex) {
            throw new BaseException("生成支付宝沙箱支付请求失败，请检查本机密钥配置");
        }
    }

    /**
     * 验证支付宝异步通知的 RSA2 签名并核对当前应用 APPID。
     * @param parameters 支付宝提交的原始表单参数
     * @return 签名有效且 APPID 匹配时返回 true
     */
    public boolean verifyNotify(Map<String, String> parameters) {
        if (!properties.isReady() || !properties.getAppId().equals(parameters.get("app_id"))) return false;
        try {
            return AlipaySignature.rsaCheckV1(parameters, properties.getPublicKey(), "UTF-8", "RSA2");
        } catch (AlipayApiException ex) {
            return false;
        }
    }

    /**
     * 对支付宝已扣款订单发起幂等退款，避免本地取消状态与渠道资金状态不一致。
     * @param orderNo 商户订单号，作为固定退款请求号以便重试
     * @param amount 订单数据库中的实付金额
     * @param reason 退款原因
     * @throws BaseException 支付宝未确认退款成功或网关调用失败
     */
    public void refund(String orderNo, BigDecimal amount, String reason) {
        AlipayTradeRefundRequest request = new AlipayTradeRefundRequest();
        AlipayTradeRefundModel model = new AlipayTradeRefundModel();
        model.setOutTradeNo(orderNo);
        model.setOutRequestNo(orderNo + "-refund");
        model.setRefundAmount(amount.setScale(2, RoundingMode.HALF_UP).toPlainString());
        model.setRefundReason(reason);
        request.setBizModel(model);
        try {
            AlipayTradeRefundResponse response = client().execute(request);
            if (response == null || !response.isSuccess()) throw new BaseException("支付宝沙箱退款未成功，请稍后重试");
        } catch (AlipayApiException ex) {
            throw new BaseException("调用支付宝沙箱退款失败，请稍后重试");
        }
    }

    /** 仅在真实沙箱支付模式调用时才初始化 SDK，并拒绝缺少回调或密钥的配置。 */
    private AlipayClient client() {
        if (!properties.isReady()) throw new BaseException("支付宝沙箱尚未配置，请检查本机支付参数");
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    client = new DefaultAlipayClient(properties.getGatewayUrl(), properties.getAppId(),
                            properties.getPrivateKey(), "json", "UTF-8", properties.getPublicKey(), "RSA2");
                }
            }
        }
        return client;
    }
}
