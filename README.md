## 1-on-1 video calling web app with:

Video + audio app with call join via link, call start / end, online / offline status, reconnect handling and scalable signaling backend.

## Core Tech Choices

Frontend

1. Angular
2. Tailwind CSS
3. WebRTC (actual video/audio)
4. WebSocket (signaling)

Backend

1. Spring Boot
2. WebSockets (STOMP or raw)
3. Redis – presence + call state
4. Kafka – optional (call events, analytics)
5. SQL – users, call history
6. NoSQL (optional) – call logs / metrics