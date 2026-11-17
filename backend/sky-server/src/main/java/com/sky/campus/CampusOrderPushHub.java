package com.sky.campus;

import jakarta.websocket.CloseReason;
import jakarta.websocket.Session;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** 管理端预约事件推送通道；连接范围来自已认证的一次性短期票据。 */
public final class CampusOrderPushHub {
    private static final long TICKET_LIFETIME_MILLIS = 30_000L;
    private static final ConcurrentMap<String, Ticket> TICKETS = new ConcurrentHashMap<>();
    private static final ConcurrentMap<String, Client> CLIENTS = new ConcurrentHashMap<>();

    private CampusOrderPushHub() { }

    /**
     * 为已通过管理端 HTTP 鉴权的账号创建一次性 WebSocket 票据。
     * 票据只保存账号所能管理的窗口范围，30 秒内可兑换一次，不把长期 JWT 暴露在连接 URL 中。
     * @param windowId 窗口工作人员绑定的窗口；管理员传 null 表示全校
     * @return 随机的一次性连接票据
     */
    public static String issueTicket(Long windowId) {
        long now = System.currentTimeMillis();
        TICKETS.entrySet().removeIf(entry -> entry.getValue().expiresAt < now);
        String value = UUID.randomUUID().toString();
        TICKETS.put(value, new Ticket(windowId, now + TICKET_LIFETIME_MILLIS));
        return value;
    }

    /**
     * 校验并消费连接票据；过期、伪造或重复使用的票据会拒绝连接。
     * @param session 已升级的 WebSocket 会话
     * @param value 查询参数中的一次性票据
     * @return 票据有效并注册成功时返回 true
     */
    public static boolean connect(Session session, String value) {
        Ticket ticket = value == null ? null : TICKETS.remove(value);
        if (ticket == null || ticket.expiresAt < System.currentTimeMillis() || !session.isOpen()) {
            close(session, CloseReason.CloseCodes.VIOLATED_POLICY, "Invalid connection ticket");
            return false;
        }
        CLIENTS.put(session.getId(), new Client(session, ticket.windowId));
        return true;
    }

    /** 从推送集合中移除已关闭的客户端连接。 */
    public static void disconnect(Session session) {
        if (session != null) CLIENTS.remove(session.getId());
    }

    /**
     * 向可管理目标窗口的在线端推送预约状态变更，不包含学号、姓名、金额或取餐码。
     * @param windowId 发生变化的预约窗口
     * @param orderId 预约主键
     * @param status 变更后的预约状态
     */
    public static void publish(Long windowId, Long orderId, int status) {
        if (windowId == null || orderId == null) return;
        String message = "{\"type\":\"order.changed\",\"orderId\":" + orderId + ",\"status\":" + status + "}";
        for (Client client : CLIENTS.values()) {
            if (client.windowId != null && !client.windowId.equals(windowId)) continue;
            if (!client.session.isOpen()) {
                CLIENTS.remove(client.session.getId(), client);
                continue;
            }
            try {
                client.session.getAsyncRemote().sendText(message, result -> {
                    if (!result.isOK()) CLIENTS.remove(client.session.getId(), client);
                });
            } catch (RuntimeException ex) {
                CLIENTS.remove(client.session.getId(), client);
            }
        }
    }

    private static void close(Session session, CloseReason.CloseCode code, String reason) {
        try {
            if (session.isOpen()) session.close(new CloseReason(code, reason));
        } catch (IOException ignored) {
            // 连接已失效时无需再尝试回复；客户端会通过管理端票据流程重新连接。
        }
    }

    private static final class Ticket {
        private final Long windowId;
        private final long expiresAt;
        private Ticket(Long windowId, long expiresAt) {
            this.windowId = windowId; this.expiresAt = expiresAt;
        }
    }

    private static final class Client {
        private final Session session;
        private final Long windowId;
        private Client(Session session, Long windowId) {
            this.session = session; this.windowId = windowId;
        }
    }
}
