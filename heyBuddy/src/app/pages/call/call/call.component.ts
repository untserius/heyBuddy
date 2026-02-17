import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnInit,
  OnDestroy,
  NgZone
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
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

  callState: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ENDED' = 'IDLE';

  stats = {
  candidateType: '',
  rtt: 0,
  outgoingBitrate: 0,
  incomingBitrate: 0
};

private statsInterval!: any;

  isMuted = false;
  isCameraOff = false;
  isScreenSharing = false;

  private cameraStream!: MediaStream;
  private cameraTrack!: MediaStreamTrack;
  private currentVideoTrack!: MediaStreamTrack;

  private signalingSub!: Subscription;
  private connectedSub!: Subscription;

  constructor(
    private route: ActivatedRoute,
    private signalling: SignallingService,
    public webRtc: WebRtcService,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.role = this.route.snapshot.paramMap.get('role')!;
    this.other = this.role === 'A' ? 'B' : 'A';

    this.webRtc.init(
      stream => {
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

    // Track connection state
    this.webRtc.pc.onconnectionstatechange = () => {
      const state = this.webRtc.pc.connectionState;

      if (state === 'connecting') {
        this.callState = 'CONNECTING';
      }

      if (state === 'connected') {
        this.callState = 'CONNECTED';
        this.startStatsMonitoring();
      }

      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.callState = 'ENDED';
      }
    };

    // Signaling messages
    this.signalingSub = this.signalling.message$.subscribe(async msg => {

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

      if (msg.type === 'LEAVE') {
        this.handleRemoteLeave();
      }
    });
  }

  async ngAfterViewInit() {

    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    this.localVideo.nativeElement.srcObject = this.cameraStream;

    this.cameraTrack = this.cameraStream.getVideoTracks()[0];
    this.currentVideoTrack = this.cameraTrack;

    this.cameraStream.getTracks().forEach(track =>
      this.webRtc.pc.addTrack(track, this.cameraStream)
    );

    this.signalling.connect(this.role);

    this.connectedSub = this.signalling.connected$.subscribe(() => {
      this.signalling.send({
        type: 'JOIN',
        callId: 'call1',
        from: this.role
      });
    });
  }

  // Leave call
  leaveCall() {
    this.signalling.send({
      type: 'LEAVE',
      callId: 'call1',
      from: this.role,
      to: this.other
    });

    this.cleanupCall();
  }

  handleRemoteLeave() {
    alert('Other user left the call');
    this.cleanupCall();
  }

  cleanupCall() {
    this.callState = 'ENDED';

    this.cameraStream?.getTracks().forEach(t => t.stop());
    this.webRtc.closeConnection();

    this.localVideo.nativeElement.srcObject = null;
    this.remoteVideo.nativeElement.srcObject = null;

    clearInterval(this.statsInterval);
  }

  toggleMute() {
    const sender = this.webRtc.pc.getSenders()
      .find(s => s.track?.kind === 'audio');

    if (sender?.track) {
      sender.track.enabled = !sender.track.enabled;
      this.isMuted = !sender.track.enabled;
    }
  }

  toggleCamera() {
    if (this.isScreenSharing) return;

    this.cameraTrack.enabled = !this.cameraTrack.enabled;
    this.isCameraOff = !this.cameraTrack.enabled;
  }

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

      this.localVideo.nativeElement.srcObject = screenStream;

      screenTrack.onended = () => this.stopScreenShare();

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

startStatsMonitoring() {

  console.log("Starting stats monitoring...");

  let lastSent = 0;
  let lastReceived = 0;

  this.statsInterval = setInterval(async () => {

    const report = await this.webRtc.pc.getStats();

    this.zone.run(() => {

      report.forEach(stat => {

        if (stat.type === 'candidate-pair' && stat.currentRoundTripTime) {
          this.stats.rtt = Math.round(stat.currentRoundTripTime * 1000);
        }

        if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
          if (stat.bytesSent !== undefined) {
            const bitrate = stat.bytesSent - lastSent;
            this.stats.outgoingBitrate = Math.round(bitrate / 1024);
            lastSent = stat.bytesSent;
          }
        }

        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          if (stat.bytesReceived !== undefined) {
            const bitrate = stat.bytesReceived - lastReceived;
            this.stats.incomingBitrate = Math.round(bitrate / 1024);
            lastReceived = stat.bytesReceived;
          }
        }

        if (stat.type === 'local-candidate' && stat.candidateType) {
          this.stats.candidateType = stat.candidateType;
        }

      });

    });

  }, 1000);
}


  ngOnDestroy() {
    this.signalingSub?.unsubscribe();
    this.connectedSub?.unsubscribe();
    this.cleanupCall();
  }
}
