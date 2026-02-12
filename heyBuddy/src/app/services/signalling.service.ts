import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root'})
export class SignallingService {

    private socket!: WebSocket;
    message$ = new Subject<any>();
    connected$ = new Subject<void>();

    connect(userId: string) {
        this.socket = new WebSocket(
            `wss://192.168.123.79:8443/ws/signaling?userId=${userId}`
        );

        this.socket.onopen = () => {
            console.log('WS connected as', userId);
            this.connected$.next();
        };

        this.socket.onmessage = e => {
            this.message$.next(JSON.parse(e.data));
        };

        this.socket.onerror = err => {
            console.error('WS error', err);
        };
    }

  send(message: any) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('WS not open, dropping message', message);
    }
  }
}