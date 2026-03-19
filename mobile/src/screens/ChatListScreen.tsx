import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { resolveAvatarUrl } from '../config';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatList'>;

const AVATAR_COLORS = [
  '#5B8DEF',
  '#53B7A8',
  '#F2994A',
  '#BB6BD9',
  '#EB5757',
  '#2D9CDB',
  '#27AE60',
  '#F2C94C',
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function ChatSeparator() {
  return <View style={styles.separator} />;
}

function formatChatTime(timestamp: number | null) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'read':
      return '✓✓';
    case 'delivered':
    case 'sent':
      return '✓';
    default:
      return '';
  }
}

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const chats = chatStore((s) => s.chats);
  const currentUserId = authStore((s) => s.user?.id ?? null);
  const messagesByChatId = messageStore((s) => s.messagesByChatId);

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={ChatSeparator}
        renderItem={({ item }) => {
          const title = item.peer_display_name || item.name || 'Chat';
          const preview = item.last_message_preview;
          const avatarUrl = resolveAvatarUrl(item.avatar_url);
          const initial = (title.trim()[0] || '?').toUpperCase();
          const avatarColor = getAvatarColor(title);
          const lastMessage = (messagesByChatId[item.id] ?? []).find((message) => message.id === item.last_message_id);
          const isLastMessageMine = lastMessage?.sender_id === currentUserId;
          const statusIcon = isLastMessageMine ? getStatusIcon(lastMessage?.status ?? '') : '';
          const timeLabel = formatChatTime(item.last_message_at);

          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                navigation.navigate('Chat', {
                  chatId: item.id,
                  chatTitle: title,
                })
              }
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor }]}>
                  <Text style={styles.avatarPlaceholderText}>{initial}</Text>
                </View>
              )}

              <View style={styles.content}>
                <View style={styles.topRow}>
                  <Text style={styles.title} numberOfLines={1}>
                    {title}
                  </Text>
                  {timeLabel ? (
                    <View style={styles.metaWrap}>
                      {statusIcon ? <Text style={styles.statusIcon}>{statusIcon}</Text> : null}
                      <Text style={styles.timeLabel}>{timeLabel}</Text>
                    </View>
                  ) : null}
                </View>
                {preview ? (
                  <Text style={styles.preview} numberOfLines={1}>
                    {preview}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No chats yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: '#F7F8FA' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  metaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
  },
  statusIcon: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '700',
  },
  timeLabel: {
    fontSize: 14,
    color: '#8A9099',
  },
  preview: {
    marginTop: 3,
    fontSize: 16,
    color: '#8A9099',
  },
  separator: {
    height: 1,
    marginLeft: 74,
    backgroundColor: '#DADFE7',
  },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});
