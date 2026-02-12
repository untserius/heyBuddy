package com.sudhird.heybuddy.signaling_service.model;

import lombok.Data;

@Data
public class SignalMessage {
    private SignalType type;
    private String callId;
    private String from;
    private String to;
    private Object payload;
}
