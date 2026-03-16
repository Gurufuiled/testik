/**
 * WebSocketProvider - connects WebSocket when authenticated, sets handlers,
 * disconnects on logout.
 */

import React, { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { WebSocketService } from '../services/WebSocketService';
import { TransportService } from '../services/TransportService';
import { SignalingService } from '../services/SignalingService';
import { SyncService } from '../services/SyncService';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import { uiStore } from '../stores/uiStore';
import { MediaDao } from '../db';
import type { Message } from '../stores/types';

/** Server new_message payload shape */
interface ServerMessagePayload {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  msg_type: string;
  status: string;
  created_at: number | string;
  media?: { duration_ms: number; waveform?: number[] }[];
}

function mapServerMessageToMessage(payload: ServerMessagePayload): Message {
  const createdAt =
    typeof payload.created_at === 'string'
      ? new Date(payload.created_at).getTime()
      : payload.created_at;

  const msg: Message = {
    id: payload.id,
    chat_id: payload.chat_id,
    sender_id: payload.sender_id,
    msg_type: payload.msg_type,
    content: payload.content,
    reply_to_id: null,
    is_edited: 0,
    is_deleted: 0,
    status: payload.status,
    transport: 'ws',
    server_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  if (payload.media?.length) {
    msg.media = payload.media.map((m) => ({
      waveform: m.waveform ?? [],
      duration_ms: m.duration_ms,
    }));
  }
  return msg;
}

type WebSocketProviderProps = {
  children: React.ReactNode;
};

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { isAuthenticated } = useAuth();
  const { isConnected: isNetworkConnected } = useNetworkStatus();
  const handlersSetRef = useRef(false);
  const prevNetworkConnectedRef = useRef<boolean | null>(null);

  // Reconnect WebSocket when network goes from offline to online (not on initial null→true)
  useEffect(() => {
    const wasOffline = prevNetworkConnectedRef.current === false;
    const isNowOnline = isNetworkConnected === true;
    prevNetworkConnectedRef.current = isNetworkConnected;

    if (wasOffline && isNowOnline && isAuthenticated) {
      WebSocketService.connect();
    }
  }, [isNetworkConnected, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      WebSocketService.disconnect();
      SignalingService.disconnect();
      return;
    }

    TransportService.init();
    SignalingService.connect();

    if (!handlersSetRef.current) {
      WebSocketService.setHandlers({
        onConnected: () => {
          SyncService.runOnConnect().catch((err) =>
            console.warn('[WebSocket] runOnConnect failed:', err)
          );
          uiStore.getState().bumpTransportStatus();
        },
        onDisconnected: () => {
          uiStore.getState().bumpTransportStatus();
        },
        onNewMessage: (payload) => {
          const msg = (payload as { message?: ServerMessagePayload }).message;
          if (!msg?.chat_id) return;
          const mapped = mapServerMessageToMessage(msg);
          messageStore.getState().prependMessage(msg.chat_id, mapped);
        },

        onMessageAck: async (payload) => {
          const currentUserId = authStore.getState().user?.id ?? null;
          const { message_id, chat_id, status, user_id } = payload as {
            message_id?: string;
            chat_id?: string;
            status?: string;
            user_id?: string;
          };
          if (!chat_id || !message_id || !user_id || currentUserId !== user_id) return;

          const messages = messageStore.getState().messagesByChatId[chat_id] ?? [];
          const sendingList = messages.filter(
            (m) => m.status === 'sending' && m.sender_id === currentUserId
          );
          const sending = sendingList.pop();
          if (!sending) return;

          const tempId = sending.id;
          messageStore.getState().updateMessage(chat_id, tempId, {
            id: message_id,
            status: status ?? 'sent',
          });

          if (tempId !== message_id) {
            const mediaDao = new MediaDao();
            const mediaRows = await mediaDao.getByMessageId(tempId);
            for (const m of mediaRows) {
              await mediaDao.update({ id: m.id, message_id });
            }
          }
        },

        onTyping: (payload) => {
          const currentUserId = authStore.getState().user?.id ?? null;
          const { chat_id, user_id } = payload as { chat_id?: string; user_id?: string };
          if (!chat_id || !user_id) return;
          if (user_id === currentUserId) return;

          uiStore.getState().setTypingUser(chat_id, user_id);
        },

        onPresence: (payload) => {
          const { user_id, is_online, last_seen } = payload as {
            user_id?: string;
            is_online?: boolean;
            last_seen?: number;
          };
          if (!user_id) return;
          uiStore.getState().setPresence(user_id, {
            is_online: is_online ?? false,
            last_seen,
          });
        },

        onError: (payload) => {
          const err = payload as { code?: string; message?: string };
          console.warn('[WebSocket] error:', err.code ?? err.message ?? payload);
        },
      });
      handlersSetRef.current = true;
    }

    WebSocketService.connect();

    return () => {
      WebSocketService.disconnect();
      SignalingService.disconnect();
    };
  }, [isAuthenticated]);

  return <>{children}</>;
}
