package com.sky.controller.notify;

import com.sky.campus.CampusOrderService;
import com.sky.service.AlipayGatewayService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

/** 支付宝公开异步通知入口；只有验签、核额并成功落库后才应答 success。 */
@Slf4j
@RestController
@RequestMapping("/notify/alipay")
public class AlipayNotifyController {
    private final AlipayGatewayService alipay;
    private final CampusOrderService orders;

    public AlipayNotifyController(AlipayGatewayService alipay, CampusOrderService orders) {
        this.alipay = alipay;
        this.orders = orders;
    }

    /**
     * 接收支付宝 RSA2 表单通知，检查签名、交易状态和金额，再幂等推进订单状态。
     * @param request 支付宝以 application/x-www-form-urlencoded 发送的通知字段
     * @return 处理成功返回纯文本 success，任何校验或持久化失败返回 failure 以便渠道重试
     */
    @PostMapping(produces = MediaType.TEXT_PLAIN_VALUE)
    public String notify(HttpServletRequest request) {
        Map<String, String> parameters = new HashMap<>();
        request.getParameterMap().forEach((key, values) -> {
            if (values != null && values.length > 0) parameters.put(key, values[0]);
        });
        if (!alipay.verifyNotify(new HashMap<>(parameters))) return "failure";
        String tradeStatus = parameters.get("trade_status");
        if (!"TRADE_SUCCESS".equals(tradeStatus) && !"TRADE_FINISHED".equals(tradeStatus)) return "success";
        String orderNo = parameters.get("out_trade_no");
        String transactionNo = parameters.get("trade_no");
        String amountText = parameters.get("total_amount");
        if (orderNo == null || transactionNo == null || amountText == null) return "failure";
        try {
            orders.completeAlipayPayment(orderNo, transactionNo, new BigDecimal(amountText));
            log.info("支付宝沙箱支付通知已处理，商户订单号：{}", orderNo);
            return "success";
        } catch (RuntimeException ex) {
            log.warn("支付宝支付通知暂未处理，商户订单号：{}，原因：{}", orderNo, ex.getMessage());
            return "failure";
        }
    }
}
