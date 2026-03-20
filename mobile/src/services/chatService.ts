/**
 * ChatService - API for creating chats (createOrFindChat).
 * POST /chats with { chat_type: 'private', member_ids: [userId] }.
 */

import { apiPost } from './apiClient';
import type { Chat } from '../stores/types';

/** API chat response (snake_case from server). */
interface ApiChat {
  id: string;
  chat_type: string;
  name: string | null;
  avatar_url: string | null;
  created_by_id: string;
  last_message_id: string | null;
  pinned_message_id: string | null;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  draft: string | null;
  created_at: number;
  updated_at: number;
  members?: { user_id: string }[];
  peer_display_name?: string | null;
}

function mapApiChatToChat(api: ApiChat): Chat {
  return {
    id: api.id ?? '',
    chat_type: (api.chat_type ?? 'private') as 'private' | 'group',
    name: api.name ?? null,
    avatar_url: api.avatar_url ?? null,
    created_by: api.created_by_id ?? null,
    last_message_id: api.last_message_id,
    pinned_message_id: api.pinned_message_id ?? null,
    last_message_at: api.last_message_at,
    last_message_preview: api.last_message_preview,
    unread_count: api.unread_count,
    is_muted: api.is_muted ? 1 : 0,
    is_pinned: api.is_pinned ? 1 : 0,
    is_archived: api.is_archived ? 1 : 0,
    draft: api.draft,
    created_at: api.created_at,
    updated_at: api.updated_at,
    members: api.members,
    peer_display_name: api.peer_display_name ?? null,
  };
}

/**
 * Create or find a private chat with the given user.
 * POST /chats { chat_type: 'private', member_ids: [userId] }.
 * Returns the Chat for the UI layer.
 */
export async function createOrFindChat(userId: string): Promise<Chat> {
  const res = await apiPost('/chats', {
    chat_type: 'private',
    member_ids: [userId],
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Failed to create chat: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  try {
    const data = (await res.json()) as ApiChat;
    return mapApiChatToChat(data);
  } catch {
    throw new Error('Invalid response from server');
  }
}
