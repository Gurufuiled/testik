import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardEvent,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { ChatsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { messageStore } from '../stores/messageStore';
import { TransportService } from '../services/TransportService';
import { SyncService } from '../services/SyncService';
import { InputBar } from '../components/InputBar';
import { ImageBubble, MessageTimeStatus, VoiceBubble } from '../components';
import type { Message } from '../stores/types';

type ChatRoute = RouteProp<ChatsStackParamList, 'Chat'>;

const EMPTY_MESSAGES: Message[] = [];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const { chatId } = route.params;
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(82);
  // useSyncExternalStore ensures UI updates when store changes (real-time messages)
  const messages = useSyncExternalStore(
    (onStoreChange) => messageStore.subscribe(onStoreChange),
    () => messageStore.getState().messagesByChatId[chatId] ?? EMPTY_MESSAGES,
    () => EMPTY_MESSAGES
  );

  // Load messages from API when opening chat with no messages (fixes recipient seeing empty)
  useEffect(() => {
    const existing = messageStore.getState().messagesByChatId[chatId];
    if (__DEV__) {
      console.log('[ChatScreen] mount', chatId, 'existing messages:', existing?.length ?? 0, 'first content:', existing?.[0]?.content?.slice(0, 30));
    }
    if (!existing?.length) {
      SyncService.fetchMessagesForChat(chatId).catch(() => {});
    }
  }, [chatId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleSendText = useCallback(
    (text: string) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const msg: Message = {
        id: tempId,
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
      messageStore.getState().prependMessage(chatId, msg);
      TransportService.sendMessage(chatId, text, 'text', tempId);
    },
    [chatId, currentUserId]
  );

  const handleSendVoice = useCallback(
    async (result: { uri: string; waveform: number[]; durationMs: number }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const msg: Message = {
        id: tempId,
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
      messageStore.getState().prependMessage(chatId, msg);
      await TransportService.sendVoiceMessage(
        chatId,
        { uri: result.uri, durationMs: result.durationMs, waveform: result.waveform },
        tempId
      );
    },
    [chatId, currentUserId]
  );

  const handleSendImage = useCallback(
    async (result: { uri: string; width?: number; height?: number; caption?: string }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'image',
        content: result.caption ?? null,
        reply_to_id: null,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        media: [
          {
            remote_url: result.uri,
            width: result.width,
            height: result.height,
          },
        ],
      };
      messageStore.getState().prependMessage(chatId, msg);
      await TransportService.sendImageMessage(
        chatId,
        {
          uri: result.uri,
          width: result.width,
          height: result.height,
          caption: result.caption,
        },
        tempId
      );
    },
    [chatId, currentUserId]
  );

  const handleSendFile = useCallback(
    async (result: { uri: string; name: string; size: number; mimeType?: string }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      await TransportService.sendFileMessage(
        chatId,
        {
          uri: result.uri,
          name: result.name,
          size: result.size,
          mimeType: result.mimeType,
        },
        tempId
      );
    },
    [chatId, currentUserId]
  );

  // messages from store: [newest, ..., oldest] (prependMessage adds at front; API returns desc)
  // inverted FlatList: first item at bottom, data[0] = newest
  const listData = messages;

  const handleInputBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== inputBarHeight) {
      setInputBarHeight(nextHeight);
    }
  }, [inputBarHeight]);

  return (
    <View style={styles.container}>
      <View style={styles.listWrap}>
        <FlatList
          key={`${chatId}-${messages.length}`}
          data={listData}
          keyExtractor={(m) => m.id}
          inverted
          extraData={messages.length}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: keyboardHeight + inputBarHeight + 8 },
          ]}
          renderItem={({ item }) => {
            const isMe = item.sender_id === currentUserId;
            if (item.msg_type === 'text') {
              const rawContent = item.content ?? '';
              const displayContent = rawContent.trim() || ' ';
              if (__DEV__ && !rawContent.trim()) {
                console.log('[ChatScreen] empty content for msg', item.id, 'content type:', typeof item.content);
              }
              return (
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  <Text style={[styles.textContent, isMe && styles.textContentMe]}>
                    {displayContent}
                  </Text>
                  <View style={styles.timeRow}>
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
            if (item.msg_type === 'image') {
              const media = item.media?.[0];
              const imageUri = media?.remote_url ?? item.content ?? '';

              if (!imageUri.trim()) return null;

              return (
                <ImageBubble
                  uri={imageUri}
                  isMe={isMe}
                  width={media?.width}
                  height={media?.height}
                  caption={item.content ?? undefined}
                  time={formatTime(item.created_at)}
                  status={item.status}
                />
              );
            }
            return null;
          }}
        />
      </View>
      <View
        onLayout={handleInputBarLayout}
        style={[styles.inputBarWrap, { bottom: keyboardHeight }]}
      >
        <InputBar
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendImage={handleSendImage}
          onSendFile={handleSendFile}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  inputBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
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
  textContent: {
    fontSize: 16,
    color: '#000',
  },
  textContentMe: { color: '#fff' },
  timeRow: { alignSelf: 'flex-end', marginTop: 4 },
});
