/**
 * WebSocket service for realtime messaging.
 * Uses native WebSocket API. Connects to port 4001, auths with JWT, auto-reconnects.
 */

import { getWebSocketUrl } from '../config';
import { authStore } from '../stores/authStore';

type WebSocketMessage = {
  type: string;
  [key: string]: unknown;
};

export type WebSocketEventHandlers = {
  onNewMessage?: (payload: WebSocketMessage) => void;
  onMessageAck?: (payload: WebSocketMessage) => void;
  onTyping?: (payload: WebSocketMessage) => void;
  onPresence?: (payload: WebSocketMessage) => void;
  onError?: (payload: WebSocketMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

class WebSocketServiceClass {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualDisconnect = false;
  private handlers: WebSocketEventHandlers = {};

  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(): void {
    const token = authStore.getState().accessToken;
    if (!token) {
      return;
    }

    this.manualDisconnect = false;
    this.doConnect(token);
  }

  private doConnect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const url = getWebSocketUrl();
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.sendAuth(token);
      this.handlers.onConnected?.();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.handlers.onDisconnected?.();
      if (!this.manualDisconnect && authStore.getState().accessToken) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // Error details come via onclose; avoid duplicate handling
    };
  }

  private sendAuth(token: string): void {
    this.send({ type: 'auth', token });
  }

  private handleMessage(raw: string | Blob): void {
    let data: string;
    if (typeof raw === 'string') {
      data = raw;
    } else {
      // Blob - would need async read; for text frames WebSocket usually gives string
      return;
    }

    let msg: WebSocketMessage;
    try {
      msg = JSON.parse(data) as WebSocketMessage;
    } catch {
      return;
    }

    const type = msg?.type;
    if (!type) return;

    switch (type) {
      case 'message':
      case 'new_message':
        this.handlers.onNewMessage?.(msg);
        break;
      case 'ack':
      case 'message_ack':
        this.handlers.onMessageAck?.(msg);
        break;
      case 'typing':
        this.handlers.onTyping?.(msg);
        break;
      case 'presence':
        this.handlers.onPresence?.(msg);
        break;
      case 'error':
        this.handlers.onError?.(msg);
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

  send(data: Record<string, unknown> | string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.ws.send(payload);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const WebSocketService = new WebSocketServiceClass();
