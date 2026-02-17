import { Injectable } from "@angular/core";

@Injectable({ providedIn: 'root'})
export class WebRtcService {

  pc!: RTCPeerConnection;
  remoteDescSet = false;
  pendingCandidates: RTCIceCandidate[] = [];

  private remoteStream = new MediaStream();

  init(
    onTrack: (stream: MediaStream) => void,
    onIce: (candidate: RTCIceCandidate) => void
  ) {

    // If an old connection exists, close it
    if (this.pc) {
      this.pc.close();
    }

    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.remoteStream = new MediaStream();

    this.pc = new RTCPeerConnection({
      iceTransportPolicy: 'relay',
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:192.168.123.199:3478',
          username: 'testuser',
          credential: 'testpass'
        }
      ]
    });

    // Force ICE gathering
    this.pc.createDataChannel('debug');

    this.pc.ontrack = (event) => {
      console.log('Remote track received');
      this.remoteStream.addTrack(event.track);
      onTrack(this.remoteStream);
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('ICE generated');
        onIce(e.candidate);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', this.pc.iceConnectionState);
    };

    this.pc.onconnectionstatechange = () => {
      console.log('PC state:', this.pc.connectionState);
    };
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return { type: offer.type, sdp: offer.sdp };
  }

  async handleOffer(offer: any) {
    await this.pc.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    this.remoteDescSet = true;

    for (const c of this.pendingCandidates) {
      await this.pc.addIceCandidate(c);
    }
    this.pendingCandidates = [];

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return { type: answer.type, sdp: answer.sdp };
  }

  async handleAnswer(answer: any) {
    await this.pc.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    this.remoteDescSet = true;

    for (const c of this.pendingCandidates) {
      await this.pc.addIceCandidate(c);
    }
    this.pendingCandidates = [];
  }

  addIceCandidate(candidate: any) {
    const ice = new RTCIceCandidate(candidate);

    if (this.remoteDescSet) {
      this.pc.addIceCandidate(ice);
    } else {
      this.pendingCandidates.push(ice);
    }
  }

  closeConnection() {
    console.log('Closing peer connection');

    if (this.pc) {
      this.pc.getSenders().forEach(s => s.track?.stop());
      this.pc.close();
    }

    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.remoteStream = new MediaStream();
  }
}
