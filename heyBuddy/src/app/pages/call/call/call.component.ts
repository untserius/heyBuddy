import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnInit,
  OnDestroy
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SignallingService } from 'src/app/services/signalling.service';
import { WebRtcService } from 'src/app/services/webrtc.service';

@Component({
  selector: 'app-call',
  templateUrl: './call.component.html'
})
export class CallComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;

  role!: string;
  other!: string;

  // Control states
  isMuted = false;
  isCameraOff = false;
  isScreenSharing = false;

  // Media references
  private cameraStream!: MediaStream;
  private cameraTrack!: MediaStreamTrack;
  private currentVideoTrack!: MediaStreamTrack;

  constructor(
    private route: ActivatedRoute,
    private signalling: SignallingService,
    private webRtc: WebRtcService
  ) {}

  ngOnInit() {
    console.log('CallComponent initialized');

    this.role = this.route.snapshot.paramMap.get('role')!;
    this.other = this.role === 'A' ? 'B' : 'A';

    // Initialize WebRTC
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

    // Get camera + mic once
    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    this.localVideo.nativeElement.srcObject = this.cameraStream;

    this.cameraTrack = this.cameraStream.getVideoTracks()[0];
    this.currentVideoTrack = this.cameraTrack;

    // Add tracks to peer connection
    this.cameraStream.getTracks().forEach(track =>
      this.webRtc.pc.addTrack(track, this.cameraStream)
    );

    // Connect signaling AFTER media ready
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

  // 🎤 Mute / Unmute
  toggleMute() {
    const sender = this.webRtc.pc.getSenders()
      .find(s => s.track?.kind === 'audio');

    if (sender?.track) {
      sender.track.enabled = !sender.track.enabled;
      this.isMuted = !sender.track.enabled;
    }
  }

  // 🎥 Camera On / Off
  toggleCamera() {
    if (this.isScreenSharing) {
      console.warn('Cannot toggle camera while screen sharing');
      return;
    }

    this.cameraTrack.enabled = !this.cameraTrack.enabled;
    this.isCameraOff = !this.cameraTrack.enabled;
  }

  // 🖥 Screen Share
  async toggleScreenShare() {
    const sender = this.webRtc.pc.getSenders()
      .find(s => s.track?.kind === 'video');

    if (!sender) return;

    if (!this.isScreenSharing) {
      const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true
      });

      const screenTrack = screenStream.getVideoTracks()[0];

      await sender.replaceTrack(screenTrack);
      this.currentVideoTrack = screenTrack;

      // Update local preview
      this.localVideo.nativeElement.srcObject = screenStream;

      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      this.isScreenSharing = true;

    } else {
      this.stopScreenShare();
    }
  }

  async stopScreenShare() {
    const sender = this.webRtc.pc.getSenders()
      .find(s => s.track?.kind === 'video');

    if (!sender) return;

    await sender.replaceTrack(this.cameraTrack);
    this.currentVideoTrack = this.cameraTrack;

    this.localVideo.nativeElement.srcObject = this.cameraStream;

    this.isScreenSharing = false;
  }

  ngOnDestroy() {
    this.cameraStream?.getTracks().forEach(t => t.stop());
    this.webRtc.pc?.close();
  }
}
