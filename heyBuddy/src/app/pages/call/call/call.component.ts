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
  viewReady = false;
  mediaReady = false;

  constructor(
    private route: ActivatedRoute,
    private signalling: SignallingService,
    private webRtc: WebRtcService
  ) {}

  ngOnInit() {
    console.log('CallComponent initialized');

    this.role = this.route.snapshot.paramMap.get('role')!;
    this.other = this.role === 'A' ? 'B' : 'A';

    // Init WebRTC first
    this.webRtc.init(
      stream => {
        console.log('Remote track received');

        const video = this.remoteVideo.nativeElement;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.play().catch(() => {});
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

    // Handle signaling
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
    console.log('View initialized');

    await this.webRtc.addLocalStream(this.localVideo.nativeElement);

    // Only connect signaling AFTER media is ready
    this.signalling.connect(this.role);

    this.signalling.connected$.subscribe(() => {
      console.log('WS open, sending JOIN');
      this.signalling.send({
        type: 'JOIN',
        callId: 'call1',
        from: this.role
      });
    });
  }
}
