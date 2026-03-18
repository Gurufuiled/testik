import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChatsStackParamList } from '../navigation/types';
import { chatStore } from '../stores/chatStore';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'ChatList'>;

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const chats = chatStore((s) => s.chats);

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() =>
              navigation.navigate('Chat', {
                chatId: item.id,
                chatTitle: item.peer_display_name || item.name || 'Chat',
              })
            }
          >
            <Text style={styles.title} numberOfLines={1}>
              {item.peer_display_name || item.name || 'Chat'}
            </Text>
            {item.last_message_preview != null && (
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message_preview}
              </Text>
            )}
          </Pressable>
        )}
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
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  rowPressed: { backgroundColor: '#f5f5f5' },
  title: { fontSize: 16, fontWeight: '600' },
  preview: { fontSize: 14, color: '#666', marginTop: 4 },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#999' },
});
