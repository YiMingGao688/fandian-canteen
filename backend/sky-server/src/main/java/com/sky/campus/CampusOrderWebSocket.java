package com.sky.campus;

import jakarta.websocket.OnClose;
import jakarta.websocket.OnError;
import jakarta.websocket.OnOpen;
import jakarta.websocket.Session;
import jakarta.websocket.server.ServerEndpoint;
import org.springframework.stereotype.Component;
import java.util.List;

/** 只接受由受保护管理接口签发的一次性票据，供管理端接收校园预约变更事件。 */
@ServerEndpoint("/campus/ws")
@Component
public class CampusOrderWebSocket {

    /**
     * 校验并消费短期票据后登记连接；无效或重放票据会由推送 Hub 关闭。
     * @param session WebSocket 会话
     */
    @OnOpen
    public void onOpen(Session session) {
        List<String> values = session.getRequestParameterMap().get("ticket");
        CampusOrderPushHub.connect(session, values == null || values.isEmpty() ? null : values.get(0));
    }

    /** 连接正常关闭时从各窗口推送集合中清理会话。 */
    @OnClose
    public void onClose(Session session) {
        CampusOrderPushHub.disconnect(session);
    }

    /** 异常断开也清理会话，避免无效连接继续占用推送集合。 */
    @OnError
    public void onError(Session session, Throwable error) {
        CampusOrderPushHub.disconnect(session);
    }
}
