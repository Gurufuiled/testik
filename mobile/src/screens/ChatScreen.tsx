import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Clipboard from 'expo-clipboard';
import { BlurTargetView, BlurView } from 'expo-blur';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Swipeable from 'react-native-gesture-handler/Swipeable';
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
type ChatNavigation = NativeStackNavigationProp<ChatsStackParamList, 'Chat'>;
type MessageMenuActionKey = 'reply' | 'copy' | 'pin' | 'forward' | 'delete' | 'select';

type MenuState = {
  messageId: string;
  isMe: boolean;
  previewTop: number;
  previewLeft: number;
  previewWidth: number;
  previewHeight: number;
  menuTop: number;
  menuLeft: number;
  placement: 'above' | 'below';
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
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MENU_WIDTH = Math.min(202, SCREEN_WIDTH - 24);
const MENU_ITEM_HEIGHT = 39;
const MENU_HEIGHT = MENU_ITEM_HEIGHT * 6 + 2;
const MENU_EDGE_GAP = 12;
const MENU_TO_MESSAGE_GAP = 6;
const REACTION_BAR_HEIGHT = 40;
const REACTION_BAR_WIDTH = 248;
const OVERLAY_TOP_INSET = 86;
const OVERLAY_BOTTOM_INSET = 110;
const CHAT_BACKGROUND = require('../../chat/chat-bg.png');
const MENU_REACTIONS = ['❤️', '👏', '😭', '🥰', '💋', '🤣', '👍'];

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
  const navigation = useNavigation<ChatNavigation>();
  const route = useRoute<ChatRoute>();
  const { chatId, focusMessageId } = route.params;
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const listRef = useRef<FlatList<Message> | null>(null);
  const blurTargetRef = useRef<View | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(82);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardSourceMessageId, setForwardSourceMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const messageContentRefs = useRef<Record<string, View | null>>({});  
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const scrollToMessageId = useCallback((messageId: string, missingMessageTitle?: string) => {
    const targetIndex = messages.findIndex((message) => message.id === messageId);
    if (targetIndex < 0) {
      Alert.alert(
        missingMessageTitle ?? 'Сообщение не найдено',
        'Нужное сообщение пока не загружено в этот экран.'
      );
      return false;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.45,
      });
    });

    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimeoutRef.current = null;
    }, 1800);

    return true;
  }, [messages]);

  const handlePinnedBannerPress = useCallback(() => {
    if (!pinnedMessageId) return;
    scrollToMessageId(pinnedMessageId, 'Сообщение не найдено');
  }, [pinnedMessageId, scrollToMessageId]);

  useEffect(() => {
    if (!focusMessageId) return;

    const didScroll = scrollToMessageId(focusMessageId, 'Сообщение недоступно');
    if (didScroll) {
      navigation.setParams({ focusMessageId: undefined });
    }
  }, [focusMessageId, navigation, scrollToMessageId]);

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

  const setMessageContentRef = useCallback((messageId: string, node: View | null) => {
    if (node) {
      messageContentRefs.current[messageId] = node;
      return;
    }

    delete messageContentRefs.current[messageId];
  }, []);

  const openMessageMenu = useCallback((message: Message) => {
    const target = messageContentRefs.current[message.id];
    if (!target) return;

    Keyboard.dismiss();

    target.measureInWindow((pageX, pageY, width, height) => {
      const previewLeft = Math.max(MENU_EDGE_GAP, Math.min(pageX, SCREEN_WIDTH - width - MENU_EDGE_GAP));
      const minPreviewTop = OVERLAY_TOP_INSET;
      const maxPreviewTop = SCREEN_HEIGHT - OVERLAY_BOTTOM_INSET - height;
      const anchoredTop = Math.max(minPreviewTop, Math.min(pageY, maxPreviewTop));
      const menuLeftBase = message.sender_id === currentUserId
        ? previewLeft + width - MENU_WIDTH
        : previewLeft;
      const menuLeft = Math.max(
        MENU_EDGE_GAP,
        Math.min(menuLeftBase, SCREEN_WIDTH - MENU_WIDTH - MENU_EDGE_GAP)
      );

      let previewTop = anchoredTop;
      let menuTop = previewTop + height + MENU_TO_MESSAGE_GAP;
      let placement: 'above' | 'below' = 'below';

      const bottomLimit = SCREEN_HEIGHT - MENU_EDGE_GAP;
      const overflowBottom = menuTop + MENU_HEIGHT - bottomLimit;

      if (overflowBottom > 0) {
        const liftedPreviewTop = Math.max(minPreviewTop, previewTop - overflowBottom);
        const liftedMenuTop = liftedPreviewTop + height + MENU_TO_MESSAGE_GAP;

        if (liftedMenuTop + MENU_HEIGHT <= bottomLimit) {
          previewTop = liftedPreviewTop;
          menuTop = liftedMenuTop;
        } else {
          placement = 'above';
          menuTop = Math.max(MENU_EDGE_GAP, previewTop - MENU_TO_MESSAGE_GAP - MENU_HEIGHT);
        }
      }

      setMenuState({
        messageId: message.id,
        isMe: message.sender_id === currentUserId,
        previewTop,
        previewLeft,
        previewWidth: width,
        previewHeight: height,
        menuTop,
        menuLeft,
        placement,
      });
    });
  }, [currentUserId]);

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
      Alert.alert('Не удалось переслать', 'Этот тип сообщения пока нельзя переслать.');
      return;
    }

    const targetChat = chats.find((chat) => chat.id === targetChatId);
    Alert.alert(
      'Переслано',
      `Сообщение отправлено в чат «${targetChat?.peer_display_name || targetChat?.name || 'Чат'}».`
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
          Alert.alert('Нечего копировать', 'В этом сообщении нет текста для копирования.');
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

  const canSwipeReply = useCallback((message: Message) => {
    if (selectionMode) return false;
    if (message.is_deleted === 1) return false;
    return message.msg_type === 'text' || message.msg_type === 'voice' || message.msg_type === 'image';
  }, [selectionMode]);

  const handleSwipeReply = useCallback((message: Message) => {
    setReplyToMessageId(message.id);
    const swipeable = swipeableRefs.current[message.id];
    requestAnimationFrame(() => {
      swipeable?.close();
    });
  }, []);

  const renderReplySwipeAction = useCallback(() => {
    return (
      <View style={styles.replySwipeAction}>
        <View style={styles.replySwipeIconWrap}>
          <Feather name="corner-left-up" size={18} color="#4D8DFF" />
        </View>
      </View>
    );
  }, []);

  const renderReplySnippet = useCallback((message: Message, isMe: boolean) => {
    if (!message.reply_to_id) return null;
    const replied = messageById.get(message.reply_to_id);
    const author = replied
      ? getMessageAuthorName(replied, chatId, currentUserId)
      : 'Исходное сообщение';
    const text = replied
      ? buildReplyPreviewText(replied)
      : 'Исходное сообщение недоступно';

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

  const renderMessageBody = useCallback((item: Message, isSelected: boolean, forcedWidth?: number) => {
    const isMe = item.sender_id === currentUserId;
    const deleted = item.is_deleted === 1;
    const fixedWidthStyle = forcedWidth ? { width: forcedWidth, maxWidth: forcedWidth } : null;

    if (deleted) {
      return (
        <View style={[styles.deletedBubble, fixedWidthStyle, isMe ? styles.deletedBubbleMe : styles.deletedBubbleOther, isSelected && styles.selectedBubble]}>
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
      );
    }

    if (item.msg_type === 'text') {
      const rawContent = item.content ?? '';
      const displayContent = rawContent.trim() || ' ';
      return (
        <View style={[
          styles.bubble,
          fixedWidthStyle,
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
      );
    }

    if (item.msg_type === 'voice' && item.media?.[0]) {
      return (
        <View style={[styles.mediaStack, fixedWidthStyle, isSelected && styles.selectedBubble]}>
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
      );
    }

    if (item.msg_type === 'image') {
      const media = item.media?.[0];
      const imageUri = media?.remote_url ?? '';
      if (!imageUri.trim()) return null;

      return (
        <View style={[styles.mediaStack, fixedWidthStyle, isSelected && styles.selectedBubble]}>
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
      );
    }

    if (item.msg_type === 'file' && item.media?.[0]) {
      return (
        <View style={[styles.mediaStack, fixedWidthStyle, isSelected && styles.selectedBubble]}>
          {renderReplySnippet(item, isMe)}
          <FileBubble
            fileName={item.media[0].file_name ?? 'File'}
            fileSize={item.media[0].file_size}
            uri={item.media[0].remote_url ?? undefined}
            isMe={isMe}
          />
        </View>
      );
    }

    return null;
  }, [currentUserId, renderReplySnippet]);

  const renderMessageCard = useCallback((item: Message) => {
    const isMe = item.sender_id === currentUserId;
    const isSelected = selectedMessageIds.includes(item.id);
    const isHighlighted = highlightedMessageId === item.id;

    return (
      <View style={[styles.messageWrap, isMe ? styles.messageWrapMe : styles.messageWrapOther]}>
        <View
          ref={(node) => setMessageContentRef(item.id, node)}
          collapsable={false}
          style={[
            styles.messageContentMeasure,
            isHighlighted && styles.messageContentHighlighted,
          ]}
        >
          {renderMessageBody(item, isSelected)}
        </View>
      </View>
    );
  }, [currentUserId, highlightedMessageId, renderMessageBody, selectedMessageIds, setMessageContentRef]);

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

  const backdropOpacity = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [menuState?.placement === 'above' ? -14 : 16, 0],
  });
  const menuScale = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const previewTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [menuState?.placement === 'above' ? -6 : 10, 0],
  });
  const reactionTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <View style={styles.container}>
      <BlurTargetView ref={blurTargetRef} collapsable={false} style={styles.chatContentLayer}>
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
            canSwipeReply(item) ? (
              <Swipeable
                ref={(node) => {
                  swipeableRefs.current[item.id] = node;
                }}
                friction={2.15}
                rightThreshold={34}
                overshootRight={false}
                overshootLeft={false}
                renderRightActions={renderReplySwipeAction}
                onSwipeableOpen={() => handleSwipeReply(item)}
                containerStyle={styles.swipeableContainer}
                childrenContainerStyle={styles.swipeableChildren}
              >
                <Pressable
                  delayLongPress={220}
                  onPress={() => handleMessagePress(item.id)}
                  onLongPress={() => openMessageMenu(item)}
                  style={styles.messagePressable}
                >
                  {renderMessageCard(item)}
                </Pressable>
              </Swipeable>
            ) : (
              <Pressable
                delayLongPress={220}
                onPress={() => handleMessagePress(item.id)}
                onLongPress={() => openMessageMenu(item)}
                style={styles.messagePressable}
              >
                {renderMessageCard(item)}
              </Pressable>
            )
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
      </BlurTargetView>

      {menuState ? (
        <View pointerEvents="box-none" style={styles.menuOverlayRoot}>
          <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
            <Animated.View style={[styles.menuBlurWrap, { opacity: backdropOpacity }]}>
              <BlurView
                intensity={100}
                tint="default"
                blurMethod="dimezisBlurView"
                blurReductionFactor={1}
                blurTarget={blurTargetRef}
                style={styles.menuBackdropBlur}
              />
            </Animated.View>
          </Pressable>
          {activeMenuMessage ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.menuPreviewOverlay,
                {
                  top: menuState.previewTop,
                  left: menuState.previewLeft,
                  width: menuState.previewWidth,
                  opacity: menuAnim,
                  transform: [{ translateY: previewTranslateY }, { scale: menuScale }],
                },
              ]}
            >
              <View style={[styles.menuPreviewWrap, { width: menuState.previewWidth }]}>
                {renderMessageBody(activeMenuMessage, false, menuState.previewWidth)}
              </View>
            </Animated.View>
          ) : null}
          <Animated.View
            style={[
              styles.reactionBar,
              {
                top: Math.max(
                  MENU_EDGE_GAP,
                  menuState.previewTop - REACTION_BAR_HEIGHT - 8
                ),
                left: Math.max(
                  MENU_EDGE_GAP,
                  Math.min(
                    menuState.isMe
                      ? menuState.previewLeft + menuState.previewWidth - REACTION_BAR_WIDTH
                      : menuState.previewLeft,
                    SCREEN_WIDTH - REACTION_BAR_WIDTH - MENU_EDGE_GAP
                  )
                ),
                opacity: menuAnim,
                transform: [{ translateY: reactionTranslateY }, { scale: menuScale }],
              },
            ]}
          >
            {MENU_REACTIONS.map((reaction) => (
              <Text key={reaction} style={styles.reactionEmoji}>
                {reaction}
              </Text>
            ))}
            <View style={styles.reactionCheck}>
              <Feather name="check" size={18} color="#FFFFFF" />
            </View>
          </Animated.View>
          <Animated.View
            style={[
              styles.menuCard,
              {
                top: menuState?.menuTop ?? 0,
                left: menuState?.menuLeft ?? MENU_EDGE_GAP,
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
                <Feather name={action.icon as never} size={18} color={action.color} />
              </Pressable>
            ))}
          </Animated.View>
        </View>
      ) : null}

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
  chatContentLayer: {
    flex: 1,
  },
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
  swipeableContainer: {
    width: '100%',
  },
  swipeableChildren: {
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
  messageContentMeasure: {
    flexShrink: 1,
  },
  messageContentHighlighted: {
    borderRadius: 22,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
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
  replySwipeAction: {
    width: 74,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replySwipeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(77, 141, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  menuBlurWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  menuBackdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  menuPreviewOverlay: {
    position: 'absolute',
  },
  menuPreviewWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  reactionBar: {
    position: 'absolute',
    width: REACTION_BAR_WIDTH,
    height: REACTION_BAR_HEIGHT,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  reactionEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  reactionCheck: {
    marginLeft: 'auto',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#CDE0C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCard: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.935)',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  menuAction: {
    minHeight: MENU_ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  menuActionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF2',
  },
  menuActionDisabled: {
    opacity: 0.52,
  },
  menuActionLabel: {
    fontSize: 14,
    lineHeight: 18,
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



