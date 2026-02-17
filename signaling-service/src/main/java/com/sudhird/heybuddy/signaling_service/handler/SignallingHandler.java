package com.sudhird.heybuddy.signaling_service.handler;

import com.sudhird.heybuddy.signaling_service.model.SignalMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SignallingHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(SignallingHandler.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap();
    private final Map<String, Set<String>> calls = new ConcurrentHashMap();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = getUserId(session);
        log.info("WS Connection attempt from: {}", session.getRemoteAddress());
        log.info("WS URI: {}", session.getUri());
        System.out.println("CONNECTED userId=" + userId);


        try {
            sessions.put(userId, session);
            log.info("WS CONNECTED - User: {}", userId);
        } catch (Exception e) {
            log.error("Failed to establish connection", e);
            session.close();
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket error for session {}: {}", session.getId(), exception.getMessage());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        System.out.println("RAW WS MESSAGE: " + message.getPayload());
        SignalMessage signal = objectMapper.readValue(message.getPayload(), SignalMessage.class);

        System.out.println("PARSED SIGNAL: " + signal.getType()
                + " from=" + signal.getFrom()
                + " to=" + signal.getTo());

        switch(signal.getType()) {
            case JOIN -> handleJoin(signal);
            case OFFER, ANSWER, ICE -> forward(signal);
            case LEAVE -> handleLeave(signal);
        }
    }

    private void handleJoin(SignalMessage signalMessage) throws IOException {
        calls.putIfAbsent(signalMessage.getCallId(), ConcurrentHashMap.newKeySet());
        Set<String> participants = calls.get(signalMessage.getCallId());
        participants.add(signalMessage.getFrom());

        if (participants.size() == 2) {
            for (String user :  participants) {
                WebSocketSession s = sessions.get(user);
                if (s != null && s.isOpen()) {
                    s.sendMessage(new TextMessage(
                            objectMapper.writeValueAsString(
                                    Map.of("type", "READY", "callId", signalMessage.getCallId())
                            )
                    ));
                }
            }
        }

    }

    private void forward(SignalMessage signal) throws IOException {
        WebSocketSession target = sessions.get(signal.getTo());
        System.out.println("Forwarding " + signal.getType()
                + " to " + signal.getTo()
                + " session=" + target);

        if (target != null && target.isOpen()) {
            target.sendMessage(
                    new TextMessage(objectMapper.writeValueAsString(signal))
            );
        } else {
            System.out.println("Target session missing or closed");
        }
    }

    private void handleLeave(SignalMessage signalMessage) {
        Set<String> participants = calls.get(signalMessage.getCallId());
        if (participants != null) {
            participants.remove(signalMessage.getFrom());
        }
    }

    private String getUserId(WebSocketSession session) {
        return UriComponentsBuilder
                .fromUri(Objects.requireNonNull(session.getUri()))
                .build()
                .getQueryParams()
                .getFirst("userId");
    }
}
