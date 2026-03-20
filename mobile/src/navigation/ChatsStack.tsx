import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import { ChatListScreen, ChatScreen } from '../screens';
import type { ChatsStackParamList } from './types';
import { resolveAvatarUrl } from '../config';
import { authStore } from '../stores/authStore';
import { chatStore } from '../stores/chatStore';
import { uiStore } from '../stores/uiStore';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ChatsStackParamList>();

function formatPresence(isOnline?: boolean, lastSeen?: number) {
  if (isOnline) return 'в сети';
  if (!lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function ChatHeaderTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.headerTitleWrap}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function ChatHeaderAvatar({
  avatarUrl,
  title,
}: {
  avatarUrl: string | null;
  title: string;
}) {
  const initial = (title.trim()[0] || '?').toUpperCase();

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />;
  }

  return (
    <View style={styles.headerAvatarPlaceholder}>
      <Text style={styles.headerAvatarPlaceholderText}>{initial}</Text>
    </View>
  );
}

function ChatHeaderActions({
  avatarUrl,
  title,
}: {
  avatarUrl: string | null;
  title: string;
}) {
  return (
    <View style={styles.headerActions}>
      <Pressable
        style={({ pressed }) => [styles.callButton, pressed && styles.callButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel="Позвонить"
      >
        <Feather name="phone" size={16} color={colors.textPrimary} />
      </Pressable>
      <ChatHeaderAvatar avatarUrl={avatarUrl} title={title} />
    </View>
  );
}

export function ChatsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.header },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ title: 'Chats' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => {
          const title = route.params.chatTitle ?? 'Chat';
          const currentUserId = authStore.getState().user?.id;
          const chat = chatStore.getState().chats.find((item) => item.id === route.params.chatId);
          const peerId =
            chat?.members?.find((member) => member.user_id !== currentUserId)?.user_id;
          const presence = peerId ? uiStore.getState().presenceByUserId[peerId] : undefined;
          const avatarUrl = resolveAvatarUrl(chat?.avatar_url);
          const subtitle = formatPresence(presence?.is_online, presence?.last_seen);

          return {
            title,
            headerBackTitle: 'Назад',
            headerTitle: () => <ChatHeaderTitle title={title} subtitle={subtitle} />,
            headerRight: () => <ChatHeaderActions avatarUrl={avatarUrl} title={title} />,
          };
        }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 180,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  callButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
  callButtonPressed: {
    opacity: 0.72,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  headerAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#5B8DEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarPlaceholderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
