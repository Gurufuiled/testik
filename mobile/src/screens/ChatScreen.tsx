import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  ImageBackground,
  Keyboard,
  KeyboardEvent,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { ChatsStackParamList } from '../navigation/types';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { canForwardMessage, TransportService } from '../services/TransportService';
import { SyncService } from '../services/SyncService';
import {
  FileBubble,
  ImageBubble,
  InputBar,
  MessageTimeStatus,
  ReplyPreview,
  VoiceBubble,
  buildReplyPreviewText,
} from '../components';
import type { Message } from '../stores/types';

type ChatRoute = RouteProp<ChatsStackParamList, 'Chat'>;
type MessageMenuActionKey = 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select';

type MenuState = {
  messageId: string;
  pageX: number;
  pageY: number;
} | null;

type MenuAction = {
  key: MessageMenuActionKey;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  disabled: boolean;
};

const EMPTY_MESSAGES: Message[] = [];
const SCREEN_WIDTH = Dimensions.get('window').width;
const MENU_WIDTH = Math.min(238, SCREEN_WIDTH - 24);
const CHAT_BACKGROUND = require('../../chat/chat-bg.png');

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getPeerName(chatId: string, currentUserId: string | null): string | null {
  const chat = chatStore.getState().chats.find((item) => item.id === chatId);
  if (!chat) return null;
  if (chat.peer_display_name?.trim()) return chat.peer_display_name.trim();
  if (chat.name?.trim()) return chat.name.trim();
  if (chat.chat_type === 'private' && currentUserId) {
    const peerId = chat.members?.find((member) => member.user_id !== currentUserId)?.user_id;
    if (peerId) return peerId;
  }
  return null;
}

function getMessageAuthorName(message: Message, chatId: string, currentUserId: string | null): string {
  if (message.sender_id === currentUserId) {
    const me =
      authStore.getState().user?.display_name?.trim() ||
      authStore.getState().user?.username?.trim();
    return me || 'You';
  }

  return getPeerName(chatId, currentUserId) || 'Companion';
}

function getDeletedPlaceholder(isMe: boolean): string {
  return isMe ? 'You deleted this message' : 'Message deleted';
}

function getCopyableContent(message: Message): string {
  if (message.is_deleted) return '';
  if (message.msg_type === 'text') return message.content?.trim() ?? '';
  if (message.msg_type === 'image') return message.content?.trim() || message.media?.[0]?.remote_url || '';
  if (message.msg_type === 'file') {
    return message.media?.[0]?.file_name?.trim() || message.media?.[0]?.remote_url || '';
  }
  if (message.msg_type === 'voice') return 'Voice message';
  if (message.msg_type === 'video_note') return 'Video note';
  return message.content?.trim() ?? '';
}

function ChatBackgroundPattern() {
  return (
    <View pointerEvents="none" style={styles.backgroundLayer}>
      <ImageBackground
        source={CHAT_BACKGROUND}
        resizeMode="cover"
        style={styles.backgroundLayer}
        imageStyle={styles.backgroundImage}
      >
        <View style={styles.backgroundTint} />
      </ImageBackground>
    </View>
  );
}

export function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const { chatId } = route.params;
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const listRef = useRef<FlatList<Message> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(82);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardSourceMessageId, setForwardSourceMessageId] = useState<string | null>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const messages = useSyncExternalStore(
    (onStoreChange) => messageStore.subscribe(onStoreChange),
    () => messageStore.getState().messagesByChatId[chatId] ?? EMPTY_MESSAGES,
    () => EMPTY_MESSAGES
  );
  const chats = useSyncExternalStore(
    (onStoreChange) => chatStore.subscribe(onStoreChange),
    () => chatStore.getState().chats,
    () => []
  );

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of messages) {
      map.set(message.id, message);
    }
    return map;
  }, [messages]);

  const replyToMessage = replyToMessageId ? messageById.get(replyToMessageId) ?? null : null;
  const replyAuthorName = replyToMessage
    ? getMessageAuthorName(replyToMessage, chatId, currentUserId)
    : null;
  const activeMenuMessage = menuState ? messageById.get(menuState.messageId) ?? null : null;
  const selectionMode = selectedMessageIds.length > 0;
  const currentChat = chats.find((chat) => chat.id === chatId) ?? null;
  const pinnedMessageId = currentChat?.pinned_message_id ?? null;
  const pinnedMessage = pinnedMessageId ? messageById.get(pinnedMessageId) ?? null : null;
  const forwardTargets = useMemo(
    () => chats.filter((chat) => chat.id !== chatId),
    [chatId, chats]
  );

  useEffect(() => {
    const existing = messageStore.getState().messagesByChatId[chatId];
    if (!existing?.length) {
      SyncService.fetchMessagesForChat(chatId).catch(() => {});
    }
  }, [chatId]);

  useEffect(() => {
    if (pinnedMessageId && !messageById.has(pinnedMessageId)) {
      SyncService.fetchMessagesForChat(chatId).catch(() => {});
    }
  }, [chatId, messageById, pinnedMessageId]);

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

  useEffect(() => {
    if (replyToMessageId && !messageById.has(replyToMessageId)) {
      setReplyToMessageId(null);
    }
  }, [messageById, replyToMessageId]);

  const clearReplyState = useCallback(() => {
    setReplyToMessageId(null);
  }, []);

  const handlePinnedBannerPress = useCallback(() => {
    if (!pinnedMessageId) return;

    const targetIndex = messages.findIndex((message) => message.id === pinnedMessageId);
    if (targetIndex < 0) {
      Alert.alert(
        'Сообщение не найдено',
        'Закрепленное сообщение пока не загружено в этот экран.'
      );
      return;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.45,
      });
    });
  }, [messages, pinnedMessageId]);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const fallbackOffset = Math.max(info.index * Math.max(info.averageItemLength, 72), 0);
      listRef.current?.scrollToOffset({ offset: fallbackOffset, animated: true });

      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
          viewPosition: 0.45,
        });
      }, 120);
    },
    []
  );

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  }, []);

  const handleMessagePress = useCallback((messageId: string) => {
    if (!selectionMode) return;
    toggleSelectedMessage(messageId);
  }, [selectionMode, toggleSelectedMessage]);

  const handleMessageLongPress = useCallback((message: Message, pageX: number, pageY: number) => {
    setMenuState({ messageId: message.id, pageX, pageY });
  }, []);

  const closeMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMenuState(null);
      }
    });
  }, [menuAnim]);

  useEffect(() => {
    if (!menuState) {
      menuAnim.setValue(0);
      return;
    }

    Animated.spring(menuAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [menuAnim, menuState]);

  const handleSendText = useCallback(
    (text: string) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'text',
        content: text,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
      };
      messageStore.getState().prependMessage(chatId, msg);
      TransportService.sendMessage(chatId, text, 'text', tempId, activeReplyId);
      setReplyToMessageId(null);
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendVoice = useCallback(
    async (result: { uri: string; waveform: number[]; durationMs: number }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'voice',
        content: null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: [{
          remote_url: result.uri,
          waveform: result.waveform,
          duration_ms: result.durationMs,
        }],
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      await TransportService.sendVoiceMessage(
        chatId,
        { uri: result.uri, durationMs: result.durationMs, waveform: result.waveform },
        tempId,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendImage = useCallback(
    async (result: { uri: string; width?: number; height?: number; caption?: string }) => {
      if (!currentUserId) return;
      const tempId = `temp-${Date.now()}`;
      const activeReplyId = replyToMessageId;
      const now = Date.now();
      const msg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: currentUserId,
        msg_type: 'image',
        content: result.caption ?? null,
        reply_to_id: activeReplyId,
        is_edited: 0,
        is_deleted: 0,
        status: 'sending',
        transport: 'ws',
        server_id: null,
        created_at: now,
        updated_at: now,
        media: [
          {
            remote_url: result.uri,
            width: result.width,
            height: result.height,
          },
        ],
      };
      messageStore.getState().prependMessage(chatId, msg);
      setReplyToMessageId(null);
      await TransportService.sendImageMessage(
        chatId,
        {
          uri: result.uri,
          width: result.width,
          height: result.height,
          caption: result.caption,
        },
        tempId,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleSendFile = useCallback(
    async (result: { uri: string; name: string; size: number; mimeType?: string }) => {
      if (!currentUserId) return;
      const activeReplyId = replyToMessageId;
      setReplyToMessageId(null);
      await TransportService.sendFileMessage(
        chatId,
        {
          uri: result.uri,
          name: result.name,
          size: result.size,
          mimeType: result.mimeType,
        },
        `temp-${Date.now()}`,
        activeReplyId
      );
    },
    [chatId, currentUserId, replyToMessageId]
  );

  const handleDeleteMessage = useCallback((message: Message) => {
    closeMenu();
    if (message.sender_id !== currentUserId) {
      Alert.alert('Удаление недоступно', 'Сейчас можно удалить только свои сообщения.');
      return;
    }

    Alert.alert('Удалить сообщение?', 'Сообщение исчезнет из этого чата.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          messageStore.getState().updateMessage(chatId, message.id, {
            is_deleted: 1,
            content: null,
          });
          if (pinnedMessageId === message.id && currentChat) {
            chatStore.getState().updateChat({
              ...currentChat,
              pinned_message_id: null,
            });
          }
          TransportService.deleteMessage(chatId, message.id);
        },
      },
    ]);
  }, [chatId, closeMenu, currentChat, currentUserId, pinnedMessageId]);

  const handlePinToggle = useCallback((message: Message) => {
    const nextPinnedId = pinnedMessageId === message.id ? null : message.id;
    if (currentChat) {
      chatStore.getState().updateChat({
        ...currentChat,
        pinned_message_id: nextPinnedId,
      });
    }
    TransportService.pinMessage(chatId, nextPinnedId);
    closeMenu();
  }, [chatId, closeMenu, currentChat, pinnedMessageId]);

  const handleForwardMessage = useCallback((message: Message) => {
    closeMenu();
    setTimeout(() => {
      setForwardSourceMessageId(message.id);
    }, 150);
  }, [closeMenu]);

  const handleForwardToChat = useCallback((targetChatId: string) => {
    const source = forwardSourceMessageId ? messageById.get(forwardSourceMessageId) ?? null : null;
    if (!source) {
      setForwardSourceMessageId(null);
      return;
    }

    const sent = TransportService.forwardMessage(targetChatId, source);
    setForwardSourceMessageId(null);

    if (!sent) {
      Alert.alert('РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµСЃР»Р°С‚СЊ', 'Р­С‚РѕС‚ С‚РёРї СЃРѕРѕР±С‰РµРЅРёСЏ РїРѕРєР° РЅРµР»СЊР·СЏ РїРµСЂРµСЃР»Р°С‚СЊ.');
      return;
    }

    const targetChat = chats.find((chat) => chat.id === targetChatId);
    Alert.alert(
      'РџРµСЂРµСЃР»Р°РЅРѕ',
      `РЎРѕРѕР±С‰РµРЅРёРµ РѕС‚РїСЂР°РІР»РµРЅРѕ РІ С‡Р°С‚ В«${targetChat?.peer_display_name || targetChat?.name || 'Р§Р°С‚'}В».`
    );
  }, [chats, forwardSourceMessageId, messageById]);

  const handleMenuAction = useCallback(async (key: MessageMenuActionKey) => {
    if (!activeMenuMessage) return;

    switch (key) {
      case 'reply':
        setReplyToMessageId(activeMenuMessage.id);
        closeMenu();
        return;
      case 'copy': {
        const value = getCopyableContent(activeMenuMessage);
        closeMenu();
        if (!value) {
          Alert.alert('РќРµС‡РµРіРѕ РєРѕРїРёСЂРѕРІР°С‚СЊ', 'Р’ СЌС‚РѕРј СЃРѕРѕР±С‰РµРЅРёРё РЅРµС‚ С‚РµРєСЃС‚Р° РґР»СЏ РєРѕРїРёСЂРѕРІР°РЅРёСЏ.');
          return;
        }
        await Clipboard.setStringAsync(value);
        return;
      }
      case 'pin':
        handlePinToggle(activeMenuMessage);
        return;
      case 'forward':
        handleForwardMessage(activeMenuMessage);
        return;
      case 'select':
        toggleSelectedMessage(activeMenuMessage.id);
        closeMenu();
        return;
      case 'delete':
        handleDeleteMessage(activeMenuMessage);
        return;
    }
  }, [activeMenuMessage, closeMenu, handleDeleteMessage, handleForwardMessage, handlePinToggle, toggleSelectedMessage]);

  const handleInputBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    if (nextHeight > 0 && nextHeight !== inputBarHeight) {
      setInputBarHeight(nextHeight);
    }
  }, [inputBarHeight]);

  const renderReplySnippet = useCallback((message: Message, isMe: boolean) => {
    if (!message.reply_to_id) return null;
    const replied = messageById.get(message.reply_to_id);
    const author = replied
      ? getMessageAuthorName(replied, chatId, currentUserId)
      : 'РСЃС…РѕРґРЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ';
    const text = replied
      ? buildReplyPreviewText(replied)
      : 'РСЃС…РѕРґРЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РЅРµРґРѕСЃС‚СѓРїРЅРѕ';

    return (
      <ReplyPreview
        author={author}
        text={text}
        accentColor={isMe ? '#DFF2A8' : '#F28C28'}
        backgroundColor={isMe ? '#6A9EFF' : '#F2F4D9'}
        textColor={isMe ? 'rgba(255,255,255,0.88)' : '#5F6368'}
        authorColor={isMe ? '#FFD08A' : '#D1782B'}
      />
    );
  }, [chatId, currentUserId, messageById]);

  const renderMessageCard = useCallback((item: Message) => {
    const isMe = item.sender_id === currentUserId;
    const isSelected = selectedMessageIds.includes(item.id);
    const deleted = item.is_deleted === 1;

    if (deleted) {
      return (
        <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
          <View style={[styles.deletedBubble, isMe ? styles.deletedBubbleMe : styles.deletedBubbleOther, isSelected && styles.selectedBubble]}>
            <Text style={[styles.deletedText, isMe && styles.deletedTextMe]}>
              {getDeletedPlaceholder(isMe)}
            </Text>
            <MessageTimeStatus
              time={formatTime(item.created_at)}
              status={item.status}
              isMe={isMe}
              compact
            />
          </View>
        </View>
      );
    }

    if (item.msg_type === 'text') {
      const rawContent = item.content ?? '';
      const displayContent = rawContent.trim() || ' ';
      return (
        <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
          <View style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
            isSelected && styles.selectedBubble,
          ]}>
            {renderReplySnippet(item, isMe)}
            <View style={styles.bubbleContentRow}>
              <Text style={[styles.textContent, isMe && styles.textContentMe]}>
                {displayContent}
              </Text>
              <MessageTimeStatus
                time={formatTime(item.created_at)}
                status={item.status}
                isMe={isMe}
                compact
              />
            </View>
          </View>
        </View>
      );
    }

    if (item.msg_type === 'voice' && item.media?.[0]) {
      return (
        <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
          <View style={[styles.mediaStack, isSelected && styles.selectedBubble]}>
            {renderReplySnippet(item, isMe)}
            <VoiceBubble
              uri={item.media[0].remote_url ?? `file://${item.id}`}
              waveform={item.media[0].waveform ?? []}
              durationMs={item.media[0].duration_ms ?? 0}
              isMe={isMe}
              time={formatTime(item.created_at)}
              status={item.status}
            />
          </View>
        </View>
      );
    }

    if (item.msg_type === 'image') {
      const media = item.media?.[0];
      const imageUri = media?.remote_url ?? '';
      if (!imageUri.trim()) return null;

      return (
        <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
          <View style={[styles.mediaStack, isSelected && styles.selectedBubble]}>
            {renderReplySnippet(item, isMe)}
            <ImageBubble
              uri={imageUri}
              isMe={isMe}
              width={media?.width}
              height={media?.height}
              caption={item.content ?? undefined}
              time={formatTime(item.created_at)}
              status={item.status}
            />
          </View>
        </View>
      );
    }

    if (item.msg_type === 'file' && item.media?.[0]) {
      return (
        <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
          <View style={[styles.mediaStack, isSelected && styles.selectedBubble]}>
            {renderReplySnippet(item, isMe)}
            <FileBubble
              fileName={item.media[0].file_name ?? 'File'}
              fileSize={item.media[0].file_size}
              uri={item.media[0].remote_url ?? undefined}
              isMe={isMe}
            />
          </View>
        </View>
      );
    }

    return null;
  }, [currentUserId, renderReplySnippet, selectedMessageIds]);

  const menuActions = useMemo<MenuAction[]>(() => {
    if (!activeMenuMessage) return [];

    const isPinned = pinnedMessageId === activeMenuMessage.id;
    const canForward = canForwardMessage(activeMenuMessage);

    return [
      { key: 'reply', label: 'Ответить', icon: 'corner-left-up', color: '#111827', disabled: false },
      { key: 'copy', label: 'Скопировать', icon: 'copy', color: '#111827', disabled: false },
      { key: 'pin', label: isPinned ? 'Открепить' : 'Закрепить', icon: 'bookmark', color: '#111827', disabled: false },
      { key: 'forward', label: 'Переслать', icon: 'corner-up-right', color: canForward ? '#111827' : '#9CA3AF', disabled: !canForward },
      { key: 'delete', label: 'Удалить', icon: 'trash-2', color: '#E53935', disabled: false },
      { key: 'select', label: 'Выбрать', icon: 'check-circle', color: '#111827', disabled: false },
    ];
  }, [activeMenuMessage, pinnedMessageId]);

  const menuTop = menuState
    ? Math.max(16, Math.min(menuState.pageY + 10, 480))
    : 0;
  const menuLeft = menuState
    ? Math.max(12, Math.min(menuState.pageX - MENU_WIDTH * 0.55, SCREEN_WIDTH - MENU_WIDTH - 12))
    : 12;

  const backdropOpacity = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const menuScale = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <View style={styles.container}>
      <ChatBackgroundPattern />
      {selectionMode ? (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionBannerText}>
            Выбрано: {selectedMessageIds.length}
          </Text>
          <Pressable onPress={() => setSelectedMessageIds([])} hitSlop={10}>
            <Text style={styles.selectionBannerAction}>Очистить</Text>
          </Pressable>
        </View>
      ) : null}

      {pinnedMessage ? (
        <View style={styles.pinnedBannerWrap}>
          <View style={styles.pinnedBanner}>
            <View style={styles.pinnedAccent} />
            <Pressable onPress={handlePinnedBannerPress} style={styles.pinnedMainPressable}>
              <View style={styles.pinnedContent}>
                <Text style={styles.pinnedTitle}>Закрепленное сообщение</Text>
                <Text numberOfLines={1} style={styles.pinnedText}>
                  {buildReplyPreviewText(pinnedMessage)}
                </Text>
              </View>
            </Pressable>
            <Pressable
              hitSlop={10}
              onPress={() => {
                if (currentChat) {
                  chatStore.getState().updateChat({
                    ...currentChat,
                    pinned_message_id: null,
                  });
                }
                TransportService.pinMessage(chatId, null);
              }}
              style={styles.pinnedClose}
            >
              <Feather name="x" size={16} color="#65717E" />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          key={`${chatId}-${messages.length}`}
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          extraData={`${messages.length}-${selectedMessageIds.join(',')}-${replyToMessageId ?? ''}-${pinnedMessageId ?? ''}`}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: keyboardHeight + inputBarHeight + 8 },
          ]}
          renderItem={({ item }) => (
            <Pressable
              delayLongPress={220}
              onPress={() => handleMessagePress(item.id)}
              onLongPress={(event) =>
                handleMessageLongPress(
                  item,
                  event.nativeEvent.pageX,
                  event.nativeEvent.pageY
                )
              }
              style={styles.messagePressable}
            >
              {renderMessageCard(item)}
            </Pressable>
          )}
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
          replyToMessage={replyToMessage}
          replyAuthorName={replyAuthorName}
          onCancelReply={clearReplyState}
        />
      </View>

      <Modal
        visible={menuState != null}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
          <Animated.View style={[styles.menuBlurWrap, { opacity: backdropOpacity }]}>
            <BlurView intensity={72} tint="light" style={styles.menuBackdropBlur} />
            <View pointerEvents="none" style={styles.menuBackdropHaze} />
          </Animated.View>
          <Animated.View
            style={[
              styles.menuCard,
              {
                top: menuTop,
                left: menuLeft,
                opacity: menuAnim,
                transform: [{ translateY: menuTranslateY }, { scale: menuScale }],
              },
            ]}
          >
            {menuActions.map((action, index) => (
              <Pressable
                key={action.key}
                disabled={action.disabled}
                style={[
                  styles.menuAction,
                  action.disabled && styles.menuActionDisabled,
                  index < menuActions.length - 1 && styles.menuActionBorder,
                ]}
                onPress={() => {
                  void handleMenuAction(action.key);
                }}
              >
                <Text style={[styles.menuActionLabel, { color: action.color }]}>
                  {action.label}
                </Text>
                <Feather name={action.icon as never} size={20} color={action.color} />
              </Pressable>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={forwardSourceMessageId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setForwardSourceMessageId(null)}
      >
        <View style={styles.forwardRoot}>
          <Pressable style={styles.forwardBackdrop} onPress={() => setForwardSourceMessageId(null)} />
          <View style={styles.forwardSheet}>
            <Text style={styles.forwardTitle}>Переслать в...</Text>
            <ScrollView style={styles.forwardList} showsVerticalScrollIndicator={false}>
              {forwardTargets.map((chat) => (
                  <Pressable
                    key={chat.id}
                    onPress={() => handleForwardToChat(chat.id)}
                    style={styles.forwardRow}
                  >
                    <View style={styles.forwardAvatar}>
                      <Text style={styles.forwardAvatarText}>
                        {(chat.peer_display_name || chat.name || 'Ч')[0]?.toUpperCase() ?? 'Ч'}
                      </Text>
                    </View>
                    <View style={styles.forwardRowText}>
                      <Text style={styles.forwardChatName}>
                        {chat.peer_display_name || chat.name || 'Чат'}
                      </Text>
                      <Text numberOfLines={1} style={styles.forwardChatMeta}>
                        {chat.last_message_preview || 'Нажмите, чтобы переслать сюда'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              {forwardTargets.length === 0 ? (
                <View style={styles.forwardEmpty}>
                  <Text style={styles.forwardEmptyText}>Пока нет других чатов для пересылки.</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F4D6' },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backgroundImage: {
    opacity: 0.9,
  },
  backgroundTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244, 251, 224, 0.16)',
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7EBF0',
  },
  selectionBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  selectionBannerAction: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F28C28',
  },
  pinnedBannerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(210, 224, 235, 0.9)',
  },
  pinnedAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: '#4D8DFF',
    marginRight: 10,
  },
  pinnedContent: {
    flex: 1,
    minWidth: 0,
  },
  pinnedMainPressable: {
    flex: 1,
    minWidth: 0,
  },
  pinnedTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#4D8DFF',
  },
  pinnedText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#39414A',
  },
  pinnedClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  messagePressable: {
    width: '100%',
  },
  messageWrap: {
    paddingHorizontal: 12,
    marginVertical: 4,
    width: '100%',
  },
  messageWrapMe: {
    alignItems: 'flex-end',
  },
  messageWrapOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    maxWidth: '82%',
  },
  bubbleMe: { backgroundColor: '#007AFF' },
  bubbleOther: { backgroundColor: '#E5E5EA' },
  bubbleContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  textContent: {
    fontSize: 16,
    lineHeight: 20,
    color: '#000',
    flexShrink: 1,
  },
  textContentMe: { color: '#fff' },
  selectedBubble: {
    borderWidth: 2,
    borderColor: '#F28C28',
    borderRadius: 18,
  },
  mediaStack: {
    maxWidth: '82%',
  },
  deletedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '82%',
  },
  deletedBubbleMe: {
    backgroundColor: '#D8E8F9',
  },
  deletedBubbleOther: {
    backgroundColor: '#ECEDEF',
  },
  deletedText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#4B5563',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  deletedTextMe: {
    color: '#426789',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 17, 29, 0.08)',
  },
  menuBlurWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  menuBackdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  menuBackdropHaze: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 252, 255, 0.16)',
  },
  menuCard: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.975)',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  menuAction: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  menuActionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF2',
  },
  menuActionDisabled: {
    opacity: 0.52,
  },
  menuActionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  forwardRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  forwardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 17, 29, 0.18)',
  },
  forwardSheet: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 22,
    maxHeight: '65%',
  },
  forwardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: '#17202A',
    marginBottom: 12,
  },
  forwardList: {
    maxHeight: 360,
  },
  forwardEmpty: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  forwardEmptyText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#6B7280',
    textAlign: 'center',
  },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  forwardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#D9E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  forwardAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#487FE8',
  },
  forwardRowText: {
    flex: 1,
    minWidth: 0,
  },
  forwardChatName: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    color: '#17202A',
  },
  forwardChatMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
  },
});



