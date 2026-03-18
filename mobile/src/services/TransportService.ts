/**
 * TransportService: Routes message sending P2P first, else WebSocket, else SyncQueueDao.
 * Integrates P2PManager.onData for incoming P2P messages (TextMessage, Ack).
 * When offline, persists to sync_queue via SyncQueueDao; SyncService processes on connect.
 * P2PManager is loaded dynamically when USE_P2P=true to avoid bundling react-native-webrtc.
 */

import { WebSocketService } from './WebSocketService';
import { SyncService } from './SyncService';
import { SyncQueueDao } from '../db';
import { apiUpload } from './apiClient';
import { API_BASE_URL, USE_P2P } from '../config';
import { encode, decode, MessageType } from './p2pProtocol';
import { messageStore } from '../stores/messageStore';
import { chatStore } from '../stores/chatStore';
import { authStore } from '../stores/authStore';
import { uiStore } from '../stores/uiStore';
import type { Message } from '../stores/types';

const textDecoder = new TextDecoder('utf-8');

function queueToSyncQueue(
  dao: SyncQueueDao,
  action: string,
  payload: object,
  entityId: string
): void {
  dao
    .insert({
      action,
      payload: JSON.stringify(payload),
      entity_id: entityId,
      retry_count: 0,
      max_retries: 5,
      status: 'pending',
      created_at: Date.now(),
      next_retry_at: null,
    })
    .catch((e) => console.warn('[TransportService] SyncQueueDao.insert failed:', e));
}

function getUploadBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '') || API_BASE_URL;
}

type P2PManagerRef = {
  setHandlers: (h: { onPeerConnected?: (id: string) => void; onPeerDisconnected?: (id: string) => void; onData?: (id: string, data: ArrayBuffer) => void }) => void;
  isConnectedToPeer: (id: string) => boolean;
  sendData: (id: string, buf: ArrayBuffer) => boolean;
};

class TransportServiceClass {
  private syncQueueDao = new SyncQueueDao();
  private p2pHandlersSet = false;
  private p2pManager: P2PManagerRef | null = null;

  /** Get peer user id for a private chat (the other member). Returns null for group or if unknown. */
  getPeerUserIdForChat(chatId: string): string | null {
    const chats = chatStore.getState().chats;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat || chat.chat_type !== 'private' || !chat.members?.length) {
      return null;
    }
    const currentUserId = authStore.getState().user?.id ?? null;
    if (!currentUserId) return null;
    const others = chat.members.filter((m) => m.user_id !== currentUserId);
    return others.length === 1 ? others[0].user_id : null;
  }

  /** Get chat id for a peer (private chat between current user and peer). */
  private getChatIdForPeer(peerUserId: string): string | null {
    const chats = chatStore.getState().chats;
    const currentUserId = authStore.getState().user?.id ?? null;
    if (!currentUserId) return null;
    const chat = chats.find(
      (c) =>
        c.chat_type === 'private' &&
        c.members?.some((m) => m.user_id === peerUserId) &&
        c.members?.some((m) => m.user_id === currentUserId)
    );
    return chat?.id ?? null;
  }

  /** Connection status for a chat: P2P if connected to peer (when USE_P2P), else Server if WebSocket, else Offline. */
  getConnectionStatus(chatId?: string): 'p2p' | 'server' | 'offline' {
    if (USE_P2P && chatId && this.p2pManager) {
      const peerUserId = this.getPeerUserIdForChat(chatId);
      if (peerUserId && this.p2pManager.isConnectedToPeer(peerUserId)) {
        return 'p2p';
      }
    }
    if (WebSocketService.isConnected()) return 'server';
    return 'offline';
  }

  /**
   * Send message: P2P first (private chat + connected to peer), else WebSocket, else SyncQueueDao.
   */
  sendMessage(
    chatId: string,
    content: string,
    msgType: string,
    tempId: string
  ): void {
    const peerUserId = this.getPeerUserIdForChat(chatId);

    // Private chat: try P2P first (when USE_P2P enabled)
    if (USE_P2P && peerUserId && this.p2pManager?.isConnectedToPeer(peerUserId)) {
      const buf = encode(MessageType.TextMessage, tempId, content);
      if (this.p2pManager.sendData(peerUserId, buf)) {
        return;
      }
    }

    // WebSocket
    if (WebSocketService.isConnected()) {
      if (__DEV__) {
        console.log('[TransportService] send_message -> WS', { chatId, content: content?.slice(0, 50), msgType, tempId });
      }
      WebSocketService.sendEvent('send_message', {
        chat_id: chatId,
        content,
        msg_type: msgType,
      });
      return;
    }

    // Offline: persist to sync_queue
    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_text',
      { chatId, content, msgType, tempId },
      tempId
    );
  }

  /**
   * Send voice message: upload file, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendVoiceMessage(
    chatId: string,
    payload: { uri: string; durationMs: number; waveform?: number[] },
    tempId: string
  ): Promise<void> {
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: 'voice.m4a',
          type: 'audio/mp4',
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fullUrl,
          msg_type: 'voice',
          media: {
            url: fullUrl,
            duration_ms: payload.durationMs,
            waveform: payload.waveform,
          },
        });
      } catch {
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_voice',
          {
            chatId,
            uri: payload.uri,
            durationMs: payload.durationMs,
            waveform: payload.waveform ?? [],
            tempId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_voice',
      {
        chatId,
        uri: payload.uri,
        durationMs: payload.durationMs,
        waveform: payload.waveform ?? [],
        tempId,
      },
      tempId
    );
  }

  /**
   * Send video note: upload video (and thumbnail if provided), then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendVideoNoteMessage(
    chatId: string,
    payload: { uri: string; durationMs: number; thumbnailUri?: string },
    tempId: string
  ): Promise<void> {
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: 'video_note.mp4',
          type: 'video/mp4',
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;

        let thumbnailUrl: string | undefined;
        if (payload.thumbnailUri) {
          const thumbResult = await apiUpload({
            uri: payload.thumbnailUri,
            name: 'thumb.jpg',
            type: 'image/jpeg',
          });
          thumbnailUrl = `${getUploadBaseUrl()}${thumbResult.url.startsWith('/') ? '' : '/'}${thumbResult.url}`;
        }

        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fullUrl,
          msg_type: 'video_note',
          media: {
            url: fullUrl,
            duration_ms: payload.durationMs,
            thumbnail_url: thumbnailUrl,
            is_round: true,
          },
        });
      } catch {
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_video_note',
          {
            chatId,
            uri: payload.uri,
            durationMs: payload.durationMs,
            thumbnailUri: payload.thumbnailUri,
            tempId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_video_note',
      {
        chatId,
        uri: payload.uri,
        durationMs: payload.durationMs,
        thumbnailUri: payload.thumbnailUri,
        tempId,
      },
      tempId
    );
  }

  /**
   * Send image message: upload image via apiUpload, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendImageMessage(
    chatId: string,
    payload: { uri: string; width?: number; height?: number; fileName?: string; mimeType?: string },
    tempId: string
  ): Promise<void> {
    const imageMime = payload.mimeType ?? ((payload.fileName?.toLowerCase() ?? '').endsWith('.png') ? 'image/png' : 'image/jpeg');
    const imageName = payload.fileName ?? (imageMime === 'image/png' ? 'image.png' : 'image.jpg');
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: imageName,
          type: imageMime,
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fullUrl,
          msg_type: 'image',
          media: {
            url: fullUrl,
            width: payload.width,
            height: payload.height,
          },
        });
      } catch {
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_image',
          {
            chatId,
            uri: payload.uri,
            width: payload.width,
            height: payload.height,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            tempId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_image',
      {
        chatId,
        uri: payload.uri,
        width: payload.width,
        height: payload.height,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        tempId,
      },
      tempId
    );
  }

  /**
   * Send file message: upload file via apiUpload, then WebSocket send_message with media.
   * If offline or upload fails, persist to SyncQueueDao.
   */
  async sendFileMessage(
    chatId: string,
    payload: { uri: string; name: string; size: number; mimeType?: string },
    tempId: string
  ): Promise<void> {
    if (WebSocketService.isConnected()) {
      try {
        const result = await apiUpload({
          uri: payload.uri,
          name: payload.name,
          type: payload.mimeType ?? 'application/octet-stream',
        });
        const fullUrl = `${getUploadBaseUrl()}${result.url.startsWith('/') ? '' : '/'}${result.url}`;
        WebSocketService.sendEvent('send_message', {
          chat_id: chatId,
          content: fullUrl,
          msg_type: 'file',
          media: {
            url: fullUrl,
            file_name: result.file_name,
            file_size: result.file_size,
            mime_type: result.mime_type,
          },
        });
      } catch {
        queueToSyncQueue(
          this.syncQueueDao,
          'send_message_file',
          {
            chatId,
            uri: payload.uri,
            name: payload.name,
            size: payload.size,
            mimeType: payload.mimeType,
            tempId,
          },
          tempId
        );
      }
      return;
    }

    queueToSyncQueue(
      this.syncQueueDao,
      'send_message_file',
      {
        chatId,
        uri: payload.uri,
        name: payload.name,
        size: payload.size,
        mimeType: payload.mimeType,
        tempId,
      },
      tempId
    );
  }

  /** Process sync_queue when WebSocket connects. Delegates to SyncService.processSyncQueue(). */
  async flushQueue(): Promise<void> {
    await SyncService.processSyncQueue();
  }

  /** Wire P2PManager.onData to decode and handle TextMessage, Ack. Call once at init. Skipped when USE_P2P is false. */
  init(): Promise<void> {
    if (!USE_P2P || this.p2pHandlersSet) return Promise.resolve();
    this.p2pHandlersSet = true;

    return import('./P2PManager').then((m) => {
      this.p2pManager = m.P2PManager;
      this.p2pManager.setHandlers({
        onPeerConnected: () => uiStore.getState().bumpTransportStatus(),
        onPeerDisconnected: () => uiStore.getState().bumpTransportStatus(),
        onData: (peerUserId: string, data: ArrayBuffer) => {
          const decoded = decode(data);
          if (!decoded) return;

          const currentUserId = authStore.getState().user?.id ?? null;
          if (!currentUserId) return;

          if (decoded.type === MessageType.TextMessage) {
            const chatId = this.getChatIdForPeer(peerUserId);
            if (!chatId) return;

            const content = textDecoder.decode(decoded.payload);
            const msg: Message = {
              id: decoded.messageId,
              chat_id: chatId,
              sender_id: peerUserId,
              msg_type: 'text',
              content,
              reply_to_id: null,
              is_edited: 0,
              is_deleted: 0,
              status: 'sent',
              transport: 'p2p',
              server_id: null,
              created_at: Date.now(),
              updated_at: Date.now(),
            };
            messageStore.getState().prependMessage(chatId, msg);
            const ackBuf = encode(MessageType.Ack, decoded.messageId);
            this.p2pManager!.sendData(peerUserId, ackBuf);
          } else if (decoded.type === MessageType.Ack) {
            const chatId = this.getChatIdForPeer(peerUserId);
            if (!chatId) return;

            const messages = messageStore.getState().messagesByChatId[chatId] ?? [];
            const sendingList = messages.filter(
              (m) => m.status === 'sending' && m.sender_id === currentUserId
            );
            const sending = sendingList.find((m) => m.id === decoded.messageId);
            if (sending) {
              messageStore.getState().updateMessage(chatId, sending.id, {
                status: 'sent',
              });
            }
          }
        },
      });
    });
  }
}

export const TransportService = new TransportServiceClass();
