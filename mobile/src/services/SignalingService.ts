/**
 * Signaling service for P2P WebRTC.
 * WebSocket to signaling server (port 4002), auths with JWT, auto-reconnects.
 * Relays offer/answer/ice_candidate between peers.
 */

import { getSignalingUrl } from '../config';
import { authStore } from '../stores/authStore';

export type SignalingEventHandlers = {
  onOffer?: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void;
  onAnswer?: (fromUserId: string, sdp: RTCSessionDescriptionInit) => void;
  onIceCandidate?: (fromUserId: string, candidate: RTCIceCandidateInit | null) => void;
  onError?: (error: string | Error) => void;
};

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

type SignalingMessage = {
  type: string;
  target_user_id?: string;
  from_user_id?: string;
  sdp?: string | RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
  code?: string;
  message?: string;
  token?: string;
  [key: string]: unknown;
};

class SignalingServiceClass {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private handlers: SignalingEventHandlers = {};
  private whenConnectedResolvers: Array<() => void> = [];

  setHandlers(handlers: SignalingEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(): void {
    const token = authStore.getState().accessToken;
    if (!token) {
      this.handlers.onError?.(new Error('No access token for signaling'));
      return;
    }

    this.manualDisconnect = false;
    this.doConnect(token);
  }

  private doConnect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    const baseUrl = getSignalingUrl();
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = baseUrl + sep + 'token=' + encodeURIComponent(token);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      for (const resolve of this.whenConnectedResolvers) resolve();
      this.whenConnectedResolvers = [];
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.manualDisconnect && authStore.getState().accessToken) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.handlers.onError?.(new Error('Signaling WebSocket error'));
    };
  }

  private handleMessage(raw: string | Blob): void {
    let data: string;
    if (typeof raw === 'string') {
      data = raw;
    } else {
      return;
    }

    let msg: SignalingMessage;
    try {
      msg = JSON.parse(data) as SignalingMessage;
    } catch {
      return;
    }

    const type = msg?.type;
    const fromUserId = msg?.from_user_id as string | undefined;

    if (!type) return;

    switch (type) {
      case 'offer':
        if (fromUserId && msg.sdp != null) {
          const sdpInit: RTCSessionDescriptionInit =
            typeof msg.sdp === 'string'
              ? { type: 'offer', sdp: msg.sdp }
              : (msg.sdp as RTCSessionDescriptionInit);
          this.handlers.onOffer?.(fromUserId, sdpInit);
        }
        break;
      case 'answer':
        if (fromUserId && msg.sdp != null) {
          const sdpInit: RTCSessionDescriptionInit =
            typeof msg.sdp === 'string'
              ? { type: 'answer', sdp: msg.sdp }
              : (msg.sdp as RTCSessionDescriptionInit);
          this.handlers.onAnswer?.(fromUserId, sdpInit);
        }
        break;
      case 'ice_candidate':
        if (fromUserId) {
          this.handlers.onIceCandidate?.(fromUserId, msg.candidate ?? null);
        }
        break;
      case 'error':
        this.handlers.onError?.(
          (msg.message as string) ?? (msg.code as string) ?? 'Signaling error'
        );
        break;
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, this.reconnectAttempt),
      BACKOFF_MAX_MS
    );
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const token = authStore.getState().accessToken;
      if (!this.manualDisconnect && token) {
        this.doConnect(token);
      }
    }, delay);
  }

  disconnect(): void {
    this.manualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempt = 0;
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(data));
  }

  sendOffer(targetUserId: string, sdp: RTCSessionDescriptionInit): void {
    const sdpStr =
      typeof sdp === 'object' && sdp?.sdp != null ? sdp.sdp : '';
    this.send({ type: 'offer', target_user_id: targetUserId, sdp: sdpStr });
  }

  sendAnswer(targetUserId: string, sdp: RTCSessionDescriptionInit): void {
    const sdpStr =
      typeof sdp === 'object' && sdp?.sdp != null ? sdp.sdp : '';
    this.send({ type: 'answer', target_user_id: targetUserId, sdp: sdpStr });
  }

  sendIceCandidate(
    targetUserId: string,
    candidate: RTCIceCandidateInit | null
  ): void {
    this.send({
      type: 'ice_candidate',
      target_user_id: targetUserId,
      candidate: candidate ?? null,
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Resolves when signaling WebSocket is OPEN. Call connect() first if not connected. */
  whenConnected(timeoutMs = 15000): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = this.whenConnectedResolvers.indexOf(r);
        if (idx >= 0) this.whenConnectedResolvers.splice(idx, 1);
        reject(new Error('Signaling connection timeout'));
      }, timeoutMs);

      const r = () => {
        clearTimeout(t);
        resolve();
      };
      this.whenConnectedResolvers.push(r);

      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    });
  }
}

export const SignalingService = new SignalingServiceClass();
