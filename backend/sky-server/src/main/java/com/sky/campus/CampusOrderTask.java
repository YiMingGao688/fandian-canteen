package com.sky.campus;

import com.sky.mapper.CampusMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

/** 校园预约超时任务；调用独立事务服务，保证资源归还和取消状态一致。 */
@Component
@Slf4j
public class CampusOrderTask {
    private final CampusMapper mapper;
    private final CampusOrderService orders;
    public CampusOrderTask(CampusMapper mapper, CampusOrderService orders) { this.mapper = mapper; this.orders = orders; }

    /** 每分钟清理超过十五分钟未支付的校园预约，不自动核销待取餐订单。 */
    @Scheduled(cron="0 * * * * ?")
    public void expireReservations() {
        for (Long id : mapper.expiredOrders(LocalDateTime.now(CampusCatalogService.ZONE).minusMinutes(15))) {
            try { orders.expire(id); }
            catch (Exception ex) { log.error("取消超时校园预约失败，订单主键={}", id, ex); }
        }
    }
}
