import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnInit
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SignallingService } from 'src/app/services/signalling.service';
import { WebRtcService } from 'src/app/services/webrtc.service';

@Component({
  selector: 'app-call',
  templateUrl: './call.component.html'
})
export class CallComponent implements OnInit, AfterViewInit {

  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;

  role!: string;
  other!: string;

  constructor(
    private route: ActivatedRoute,
    private signalling: SignallingService,
    private webRtc: WebRtcService
  ) {}

  ngOnInit() {
    console.log('CallComponent initialized');

    this.role = this.route.snapshot.paramMap.get('role')!;
    this.other = this.role === 'A' ? 'B' : 'A';

    // 1️⃣ Connect WebSocket
    this.signalling.connect(this.role);

    // 2️⃣ Send JOIN only AFTER WS is open
    this.signalling.connected$.subscribe(() => {
      console.log('WS open, sending JOIN');
      this.signalling.send({
        type: 'JOIN',
        callId: 'call1',
        from: this.role
      });
    });

    // 3️⃣ Init WebRTC (remote stream handler)
this.webRtc.init(
  stream => {
    console.log('Remote track received');

    const video = this.remoteVideo.nativeElement;
    video.srcObject = stream;

    // 🔑 CRITICAL FIX
    video.muted = true;       // allow autoplay
    video.playsInline = true;

    video.play().catch(err => {
      console.warn('Autoplay blocked, waiting for user gesture', err);
    });
  },
  candidate => {
    this.signalling.send({
      type: 'ICE',
      callId: 'call1',
      from: this.role,
      to: this.other,
      payload: candidate
    });
  }
);

    // 4️⃣ Handle signaling messages
    this.signalling.message$.subscribe(async msg => {
        console.log('SIGNAL RECEIVED:', msg);

      if (msg.type === 'READY' && this.role === 'A') {
        const offer = await this.webRtc.createOffer();
        this.signalling.send({
          type: 'OFFER',
          callId: 'call1',
          from: 'A',
          to: 'B',
          payload: offer
        });
      }

      if (msg.type === 'OFFER' && this.role === 'B') {
        const answer = await this.webRtc.handleOffer(msg.payload);
        this.signalling.send({
          type: 'ANSWER',
          callId: 'call1',
          from: 'B',
          to: 'A',
          payload: answer
        });
      }

      if (msg.type === 'ANSWER') {
        await this.webRtc.handleAnswer(msg.payload);
      }

      if (msg.type === 'ICE') {
        this.webRtc.addIceCandidate(msg.payload);
      }
    });
  }

  async ngAfterViewInit() {
    console.log('View initialized, adding local stream');
    await this.webRtc.addLocalStream(this.localVideo.nativeElement);
  }
}
