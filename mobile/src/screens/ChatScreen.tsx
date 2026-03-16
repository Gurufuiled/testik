import React, { useCallback } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { ChatsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import { InputBar } from '../components/InputBar';
import { MessageTimeStatus, VoiceBubble } from '../components';
import type { Message } from '../stores/types';

type ChatRoute = RouteProp<ChatsStackParamList, 'Chat'>;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const { chatId } = route.params;
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const messages = messageStore((s) => s.messagesByChatId[chatId] ?? []);

  const handleSendText = useCallback(
    (text: string) => {
      if (!currentUserId) return;
      const msg: Message = {
        id: `temp-${Date.now()}`,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'text',
        content: text,
        reply_to_id: null,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      messageStore.getState().addMessage(chatId, msg);
      // In real app: send via TransportService
    },
    [chatId, currentUserId]
  );

  const handleSendVoice = useCallback(
    async (result: { uri: string; waveform: number[]; durationMs: number }) => {
      if (!currentUserId) return;
      const msg: Message = {
        id: `temp-${Date.now()}`,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'voice',
        content: null,
        reply_to_id: null,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        media: [{ waveform: result.waveform, duration_ms: result.durationMs }],
      };
      messageStore.getState().addMessage(chatId, msg);
    },
    [chatId, currentUserId]
  );

  const inverted = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={inverted}
        keyExtractor={(m) => m.id}
        inverted
        renderItem={({ item }) => {
          const isMe = item.sender_id === currentUserId;
          if (item.msg_type === 'text' && item.content) {
            return (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                <View style={styles.textRow}>
                  <Text style={[styles.textContent, isMe && styles.textContentMe]}>{item.content}</Text>
                  <MessageTimeStatus
                    time={formatTime(item.created_at)}
                    status={item.status}
                    isMe={isMe}
                  />
                </View>
              </View>
            );
          }
          if (item.msg_type === 'voice' && item.media?.[0]) {
            return (
              <VoiceBubble
                uri={item.media[0].remote_url ?? 'file://' + item.id}
                waveform={item.media[0].waveform ?? []}
                durationMs={item.media[0].duration_ms ?? 0}
                isMe={isMe}
              />
            );
          }
          return null;
        }}
      />
      <InputBar onSendText={handleSendText} onSendVoice={handleSendVoice} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  bubble: {
    marginHorizontal: 12,
    marginVertical: 4,
    maxWidth: '80%',
    alignSelf: 'flex-start',
    padding: 12,
    borderRadius: 18,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
  bubbleOther: { backgroundColor: '#e5e5ea' },
  textRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  textContent: { fontSize: 16, flex: 1 },
  textContentMe: { color: '#fff' },
});
