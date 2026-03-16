/**
 * P2PManager: WebRTC DataChannel management for P2P Messenger.
 * Manages RTCPeerConnection per remote user, exchanges SDP/ICE via SignalingService.
 * DataChannel label: "messenger".
 */

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';
import { SignalingService } from './SignalingService';
import { authStore } from '../stores/authStore';

const DATA_CHANNEL_LABEL = 'messenger';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export type P2PManagerEventHandlers = {
  onPeerConnected?: (peerUserId: string) => void;
  onPeerDisconnected?: (peerUserId: string) => void;
  onData?: (peerUserId: string, data: ArrayBuffer) => void;
};

type WebrtcDataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;

type PeerState = {
  pc: RTCPeerConnection;
  dataChannel: WebrtcDataChannel | null;
  role: 'caller' | 'callee';
  pendingIceCandidates: RTCIceCandidateInit[];
};

class P2PManagerClass {
  private peers = new Map<string, PeerState>();
  private handlers: P2PManagerEventHandlers = {};

  constructor() {
    SignalingService.setHandlers({
      onOffer: (fromUserId, sdp) => this.handleOffer(fromUserId, sdp),
      onAnswer: (fromUserId, sdp) => this.handleAnswer(fromUserId, sdp),
      onIceCandidate: (fromUserId, candidate) =>
        this.handleRemoteIceCandidate(fromUserId, candidate),
    });
  }

  setHandlers(handlers: P2PManagerEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connectToPeer(peerUserId: string): void {
    const currentUserId = authStore.getState().user?.id ?? '';
    const shouldBeCaller = currentUserId < peerUserId;

    if (this.peers.has(peerUserId)) {
      const state = this.peers.get(peerUserId)!;
      if (state.dataChannel?.readyState === 'open') return;
      if (state.pc.signalingState !== 'closed') return;
      this.cleanupPeer(peerUserId);
    }

    if (!SignalingService.isConnected()) {
      SignalingService.connect();
    }

    if (!shouldBeCaller) {
      return;
    }

    SignalingService.whenConnected()
      .then(() => {
        const existing = this.peers.get(peerUserId);
        if (existing?.dataChannel?.readyState === 'open') return;
        if (existing && existing.pc.signalingState !== 'closed') return;

        const pc = new RTCPeerConnection({
          iceServers: ICE_SERVERS,
        });

        const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL);
        const state: PeerState = {
          pc,
          dataChannel,
          role: 'caller',
          pendingIceCandidates: [],
        };
        this.peers.set(peerUserId, state);

        this.setupDataChannelHandlers(peerUserId, dataChannel);

        (pc as { onicecandidate?: (e: { candidate?: RTCIceCandidate | null }) => void }).onicecandidate = (event) => {
          if (event.candidate) {
            SignalingService.sendIceCandidate(peerUserId, event.candidate.toJSON());
          }
        };

        return pc
          .createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            const desc = pc.localDescription;
            if (desc && SignalingService.isConnected()) {
              SignalingService.sendOffer(peerUserId, {
                type: (desc.type ?? 'offer') as 'offer',
                sdp: desc.sdp ?? '',
              });
            }
          });
      })
      .catch((err) => {
        console.warn('[P2P] connectToPeer failed:', peerUserId, err);
        this.handlers.onPeerDisconnected?.(peerUserId);
        this.cleanupPeer(peerUserId);
      });
  }

  disconnectFromPeer(peerUserId: string): void {
    this.cleanupPeer(peerUserId);
  }

  sendData(peerUserId: string, data: ArrayBuffer): boolean {
    const state = this.peers.get(peerUserId);
    if (!state?.dataChannel || state.dataChannel.readyState !== 'open') {
      return false;
    }
    try {
      state.dataChannel.send(data);
      return true;
    } catch {
      return false;
    }
  }

  isConnectedToPeer(peerUserId: string): boolean {
    const state = this.peers.get(peerUserId);
    return state?.dataChannel?.readyState === 'open';
  }

  private handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit): void {
    const currentUserId = authStore.getState().user?.id ?? '';
    const theyAreCaller = fromUserId < currentUserId;

    if (this.peers.has(fromUserId)) {
      const state = this.peers.get(fromUserId)!;
      if (state.role === 'caller' && theyAreCaller) {
        this.cleanupPeer(fromUserId);
      } else if (state.pc.signalingState !== 'closed') {
        return;
      } else {
        this.cleanupPeer(fromUserId);
      }
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    const state: PeerState = {
      pc,
      dataChannel: null,
      role: 'callee',
      pendingIceCandidates: [],
    };
    this.peers.set(fromUserId, state);

    (pc as { ondatachannel?: (e: { channel: WebrtcDataChannel }) => void }).ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === DATA_CHANNEL_LABEL) {
        state.dataChannel = channel;
        this.setupDataChannelHandlers(fromUserId, channel);
      }
    };

    (pc as { onicecandidate?: (e: { candidate?: RTCIceCandidate | null }) => void }).onicecandidate = (event) => {
      if (event.candidate) {
        SignalingService.sendIceCandidate(fromUserId, event.candidate.toJSON());
      }
    };

    const offer = new RTCSessionDescription({
      type: sdp.type ?? 'offer',
      sdp: typeof sdp.sdp === 'string' ? sdp.sdp : '',
    });

    pc.setRemoteDescription(offer)
      .then(() => this.flushPendingIceCandidates(fromUserId))
      .then(() => pc.createAnswer())
      .then((answer) => pc.setLocalDescription(answer))
      .then(() => {
        const desc = pc.localDescription;
        if (desc) {
          SignalingService.sendAnswer(fromUserId, {
            type: (desc.type ?? 'answer') as 'answer',
            sdp: desc.sdp ?? '',
          });
        }
      })
      .catch((err) => {
        this.handlers.onPeerDisconnected?.(fromUserId);
        this.cleanupPeer(fromUserId);
      });
  }

  private handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit): void {
    const state = this.peers.get(fromUserId);
    if (!state || state.role !== 'caller') return;

    const answer = new RTCSessionDescription({
      type: sdp.type ?? 'answer',
      sdp: typeof sdp.sdp === 'string' ? sdp.sdp : '',
    });

    state.pc
      .setRemoteDescription(answer)
      .then(() => this.flushPendingIceCandidates(fromUserId))
      .catch((err) => {
        this.handlers.onPeerDisconnected?.(fromUserId);
        this.cleanupPeer(fromUserId);
      });
  }

  private handleRemoteIceCandidate(
    fromUserId: string,
    candidate: RTCIceCandidateInit | null
  ): void {
    if (!candidate) return;

    const state = this.peers.get(fromUserId);
    if (!state) return;

    if (state.pc.remoteDescription) {
      state.pc
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch(() => {});
    } else {
      state.pendingIceCandidates.push(candidate);
    }
  }

  private async flushPendingIceCandidates(peerUserId: string): Promise<void> {
    const state = this.peers.get(peerUserId);
    if (!state || state.pendingIceCandidates.length === 0) return;

    for (const c of state.pendingIceCandidates) {
      try {
        await state.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        // ignore
      }
    }
    state.pendingIceCandidates = [];
  }

  private setupDataChannelHandlers(
    peerUserId: string,
    channel: WebrtcDataChannel
  ): void {
    const onOpen = () => {
      this.handlers.onPeerConnected?.(peerUserId);
    };

    const onClose = () => {
      this.handlers.onPeerDisconnected?.(peerUserId);
      this.cleanupPeer(peerUserId);
    };

    const onError = () => {
      this.handlers.onPeerDisconnected?.(peerUserId);
      this.cleanupPeer(peerUserId);
    };

    const onMessage = (event: { data: ArrayBuffer | string }) => {
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        this.handlers.onData?.(peerUserId, data);
      }
    };

    (channel as { onopen?: () => void }).onopen = onOpen;
    (channel as { onclose?: () => void }).onclose = onClose;
    (channel as { onerror?: () => void }).onerror = onError;
    (channel as { onmessage?: (e: { data: ArrayBuffer | string }) => void }).onmessage = onMessage;

    if (channel.readyState === 'open') {
      onOpen();
    }
  }

  private cleanupPeer(peerUserId: string): void {
    const state = this.peers.get(peerUserId);
    if (!state) return;

    state.dataChannel?.close();
    state.pc.close();
    this.peers.delete(peerUserId);
  }
}

export const P2PManager = new P2PManagerClass();
