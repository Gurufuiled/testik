import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Feather from 'expo/node_modules/@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { resolveAvatarUrl } from '../config';
import type { ChatsStackParamList } from '../navigation/types';
import type { ApiUser } from '../services/AuthService';
import { getUserProfile } from '../services/profileService';
import { chatStore } from '../stores/chatStore';
import { messageStore } from '../stores/messageStore';
import { uiStore } from '../stores/uiStore';
import type { Message } from '../stores/types';
import { colors } from '../theme/colors';

type ChatProfileRoute = RouteProp<ChatsStackParamList, 'ChatProfile'>;
type ProfileTabKey = 'media' | 'files' | 'voice' | 'links';

type MediaTile = {
  id: string;
  uri: string;
  durationMs?: number;
};

type ListItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Feather>['name'];
};

type InfoRow = {
  id: string;
  label: string;
  value: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
};

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

const TAB_LABELS: Record<ProfileTabKey, string> = {
  media: 'Медиа',
  files: 'Файлы',
  voice: 'Голосовые',
  links: 'Ссылки',
};

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatPresence(isOnline?: boolean, lastSeen?: number | null) {
  if (isOnline) return 'в сети';
  if (lastSeen) return 'был(а) недавно';
  return 'был(а) недавно';
}

function buildDisplayName(profile: ApiUser | null, fallbackTitle: string) {
  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    fallbackTitle ||
    'Профиль'
  );
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatMessageDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function formatFileSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function extractMediaUri(message: Message): string | null {
  const media = message.media?.[0];
  const candidates = [media?.thumbnail_url, media?.remote_url, message.content];

  for (const candidate of candidates) {
    const resolved = resolveAvatarUrl(candidate ?? null);
    if (resolved) return resolved;
  }

  return null;
}

function extractLinks(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.match(/https?:\/\/[^\s]+/gi);
  return matches ?? [];
}

function buildVoiceSubtitle(message: Message) {
  const durationMs = message.media?.[0]?.duration_ms ?? 0;
  return `${formatDuration(durationMs)} • ${formatMessageDate(message.created_at)}`;
}

function buildFileSubtitle(message: Message) {
  const media = message.media?.[0];
  const sizePart = formatFileSize(media?.file_size ?? undefined);
  const datePart = formatMessageDate(message.created_at);
  return sizePart ? `${sizePart} • ${datePart}` : datePart;
}

function buildInfoRows(profile: ApiUser | null): InfoRow[] {
  const rows: InfoRow[] = [];

  if (profile?.phone?.trim()) {
    rows.push({
      id: 'phone',
      label: 'Мобильный',
      value: profile.phone.trim(),
      icon: 'phone',
    });
  }

  if (profile?.handle?.trim() || profile?.username?.trim()) {
    rows.push({
      id: 'username',
      label: 'Имя пользователя',
      value: profile?.handle?.trim()
        ? `@${profile.handle.trim()}`
        : profile?.username?.trim() || 'Не указано',
      icon: 'at-sign',
    });
  }

  return rows;
}

type QuickActionButtonProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active?: boolean;
  onPress: () => void;
};

function QuickActionButton({
  icon,
  label,
  active = false,
  onPress,
}: QuickActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
    >
      <View style={[styles.quickActionIconWrap, active && styles.quickActionIconWrapActive]}>
        <Feather name={icon} size={18} color={active ? '#FFFFFF' : colors.accent} />
      </View>
      <Text style={[styles.quickActionLabel, active && styles.quickActionLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChatProfileScreen() {
  const route = useRoute<ChatProfileRoute>();
  const { chatId, userId, chatTitle } = route.params;
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('media');
  const [selectedMediaUri, setSelectedMediaUri] = useState<string | null>(null);

  const chats = useSyncExternalStore(
    (onStoreChange) => chatStore.subscribe(onStoreChange),
    () => chatStore.getState().chats,
    () => []
  );
  const messagesByChatId = useSyncExternalStore(
    (onStoreChange) => messageStore.subscribe(onStoreChange),
    () => messageStore.getState().messagesByChatId,
    () => ({})
  );
  const livePresence = uiStore((s) => s.presenceByUserId[userId]);

  const chat = chats.find((item) => item.id === chatId) ?? null;
  const chatMessages = messagesByChatId[chatId] ?? [];

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getUserProfile(userId);
        if (!isMounted) return;
        setProfile(data);
      } catch (e) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const displayName = buildDisplayName(
    profile,
    chatTitle ?? chat?.peer_display_name ?? chat?.name ?? ''
  );
  const handleLabel = profile?.handle?.trim() ? `@${profile.handle.trim()}` : null;
  const avatarUrl = resolveAvatarUrl(profile?.avatar_url ?? chat?.avatar_url);
  const statusLabel = formatPresence(
    livePresence?.is_online ?? profile?.is_online,
    livePresence?.last_seen ?? profile?.last_seen
  );
  const avatarColor = useMemo(() => getAvatarColor(displayName), [displayName]);
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const isMuted = (chat?.is_muted ?? 0) === 1;
  const infoRows = useMemo(() => buildInfoRows(profile), [profile]);

  const mediaItems = useMemo<MediaTile[]>(
    () =>
      chatMessages
        .filter(
          (message) =>
            !message.is_deleted &&
            (message.msg_type === 'image' || message.msg_type === 'video_note')
        )
        .map((message) => ({
          id: message.id,
          uri: extractMediaUri(message) ?? '',
          durationMs:
            message.msg_type === 'video_note'
              ? message.media?.[0]?.duration_ms ?? 0
              : undefined,
        }))
        .filter((item) => item.uri.length > 0),
    [chatMessages]
  );

  const fileItems = useMemo<ListItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'file')
        .map((message) => ({
          id: message.id,
          title: message.media?.[0]?.file_name || 'Файл',
          subtitle: buildFileSubtitle(message),
          icon: 'file-text',
        })),
    [chatMessages]
  );

  const voiceItems = useMemo<ListItem[]>(
    () =>
      chatMessages
        .filter((message) => !message.is_deleted && message.msg_type === 'voice')
        .map((message, index) => ({
          id: message.id,
          title: `Голосовое #${index + 1}`,
          subtitle: buildVoiceSubtitle(message),
          icon: 'mic',
        })),
    [chatMessages]
  );

  const linkItems = useMemo<ListItem[]>(
    () =>
      chatMessages.flatMap((message) =>
        extractLinks(message.content).map((link, index) => ({
          id: `${message.id}-${index}`,
          title: link.replace(/^https?:\/\//, ''),
          subtitle: formatMessageDate(message.created_at),
          icon: 'link',
        }))
      ),
    [chatMessages]
  );

  const tabCounts = {
    media: mediaItems.length,
    files: fileItems.length,
    voice: voiceItems.length,
    links: linkItems.length,
  };

  const handleCallPress = () => {
    Alert.alert('Звонок', 'Когда появится звонок, эту кнопку можно будет привязать к audio call.');
  };

  const handleVideoPress = () => {
    Alert.alert('Видео', 'Здесь позже можно открыть видео-звонок или видео-профиль пользователя.');
  };

  const handleSearchPress = () => {
    Alert.alert(
      'Поиск по чату',
      'Следующим шагом сюда можно привязать поиск сообщений прямо внутри этого диалога.'
    );
  };

  const handleMediaPress = () => {
    setActiveTab('media');
  };

  const handleMutePress = () => {
    if (!chat) return;
    chatStore.getState().updateChat({
      ...chat,
      is_muted: isMuted ? 0 : 1,
    });
  };

  const handleMorePress = () => {
    Alert.alert(
      'Скоро здесь',
      'В этот раздел можно вынести действия вроде "Заблокировать", "Очистить историю" и "Удалить чат".'
    );
  };

  const renderTabContent = () => {
    if (activeTab === 'media') {
      if (mediaItems.length === 0) {
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Пока нет медиа</Text>
            <Text style={styles.emptySubtitle}>
              Фото и видеосообщения из чата появятся здесь.
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.mediaGrid}>
          {mediaItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setSelectedMediaUri(item.uri)}
              style={({ pressed }) => [styles.mediaTile, pressed && styles.mediaTilePressed]}
            >
              <Image source={{ uri: item.uri }} style={styles.mediaImage} />
              {item.durationMs ? (
                <View style={styles.mediaBadge}>
                  <Text style={styles.mediaBadgeText}>{formatDuration(item.durationMs)}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      );
    }

    const currentItems =
      activeTab === 'files'
        ? fileItems
        : activeTab === 'voice'
          ? voiceItems
          : linkItems;

    if (currentItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Пока пусто</Text>
          <Text style={styles.emptySubtitle}>
            Эта вкладка заполнится по мере активности в чате.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.listSection}>
        {currentItems.map((item, index) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.listRow,
              index !== currentItems.length - 1 && styles.listRowWithBorder,
              pressed && styles.listRowPressed,
            ]}
          >
            <View style={styles.listIconWrap}>
              <Feather name={item.icon} size={18} color={colors.accent} />
            </View>
            <View style={styles.listTextWrap}>
              <Text style={styles.listTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.listSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarFallbackText}>{initial}</Text>
            </View>
          )}

          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.status}>{statusLabel}</Text>
          {handleLabel ? <Text style={styles.handle}>{handleLabel}</Text> : null}

          <View style={styles.quickActionsRow}>
            <QuickActionButton icon="phone" label="Звонок" onPress={handleCallPress} />
            <QuickActionButton icon="video" label="Видео" onPress={handleVideoPress} />
            <QuickActionButton
              icon={isMuted ? 'bell-off' : 'bell'}
              label="Звук"
              active={isMuted}
              onPress={handleMutePress}
            />
            <QuickActionButton icon="search" label="Поиск" onPress={handleSearchPress} />
            <QuickActionButton icon="more-horizontal" label="Еще" onPress={handleMorePress} />
          </View>

          {loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.loaderText}>Загружаем профиль...</Text>
            </View>
          ) : null}

          {!loading && error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {infoRows.length > 0 ? (
          <View style={styles.infoCard}>
            {infoRows.map((row, index) => (
              <View key={row.id}>
                <View style={styles.infoRow}>
                  <View style={styles.infoRowTextWrap}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                  {row.icon ? (
                    <View style={styles.infoIconWrap}>
                      <Feather name={row.icon} size={16} color={colors.accent} />
                    </View>
                  ) : null}
                </View>
                {index !== infoRows.length - 1 ? <View style={styles.infoDivider} /> : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.mediaSectionCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {(Object.keys(TAB_LABELS) as ProfileTabKey[]).map((tabKey) => {
              const isActive = activeTab === tabKey;
              return (
                <Pressable
                  key={tabKey}
                  onPress={() => setActiveTab(tabKey)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    isActive && styles.tabButtonActive,
                    pressed && styles.tabButtonPressed,
                  ]}
                >
                  <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                    {TAB_LABELS[tabKey]}
                  </Text>
                  <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                    {tabCounts[tabKey]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {renderTabContent()}
        </View>
      </ScrollView>

      <Modal
        visible={selectedMediaUri != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMediaUri(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setSelectedMediaUri(null)}>
          <View style={styles.viewerContent}>
            {selectedMediaUri ? (
              <Image source={{ uri: selectedMediaUri }} style={styles.viewerImage} resizeMode="contain" />
            ) : null}
            <Pressable
              onPress={() => setSelectedMediaUri(null)}
              style={styles.viewerClose}
              hitSlop={10}
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },
  scrollContent: {
    paddingBottom: 28,
  },
  heroCard: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 16,
    backgroundColor: '#F7F9FD',
  },
  heroGlow: {
    position: 'absolute',
    top: -70,
    width: 260,
    height: 220,
    borderRadius: 130,
    backgroundColor: 'rgba(114,168,255,0.14)',
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarFallback: {
    width: 108,
    height: 108,
    borderRadius: 54,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  avatarFallbackText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  status: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  handle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  quickActionsRow: {
    marginTop: 20,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickAction: {
    width: 64,
    alignItems: 'center',
  },
  quickActionPressed: {
    opacity: 0.76,
  },
  quickActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(216,224,234,0.8)',
    shadowColor: '#89A8D8',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  quickActionIconWrapActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  quickActionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
  },
  quickActionLabelActive: {
    color: colors.accent,
  },
  loaderRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
    color: '#E05263',
  },
  infoCard: {
    marginTop: 10,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  infoRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoRowTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.1)',
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E1E6EF',
  },
  mediaSectionCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 320,
  },
  tabsRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F2F5FA',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(77,141,255,0.12)',
  },
  tabButtonPressed: {
    opacity: 0.8,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7D8795',
  },
  tabButtonTextActive: {
    color: colors.accent,
  },
  tabCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0A9B6',
  },
  tabCountActive: {
    color: colors.accent,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 3,
  },
  mediaTile: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: 3,
  },
  mediaTilePressed: {
    opacity: 0.88,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#E6ECF5',
  },
  mediaBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(16,24,40,0.6)',
  },
  mediaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listSection: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  listRowWithBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E6EF',
  },
  listRowPressed: {
    opacity: 0.82,
  },
  listIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,141,255,0.12)',
    marginRight: 12,
  },
  listTextWrap: {
    flex: 1,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 46,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerClose: {
    position: 'absolute',
    top: 54,
    right: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
});
