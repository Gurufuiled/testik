/**
 * Mock API responses for development without backend.
 * Enable via EXPO_PUBLIC_USE_MOCKS=true in .env
 */

const MOCK_USER_ID = 'mock-current-user';
const MOCK_PEER_ID = 'mock-peer-user';

const mockChats = [
  {
    id: 'mock-chat-1',
    chat_type: 'private',
    name: 'Alice',
    avatar_url: null,
    created_by_id: MOCK_USER_ID,
    last_message_id: 'mock-msg-2',
    pinned_message_id: null,
    last_message_at: Date.now() - 60000,
    last_message_preview: 'Hello! How are you?',
    unread_count: 1,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: Date.now() - 86400000,
    updated_at: Date.now(),
    members: [{ user_id: MOCK_PEER_ID }],
  },
  {
    id: 'mock-chat-2',
    chat_type: 'private',
    name: 'Bob',
    avatar_url: null,
    created_by_id: MOCK_USER_ID,
    last_message_id: 'mock-msg-4',
    pinned_message_id: null,
    last_message_at: Date.now() - 3600000,
    last_message_preview: 'See you tomorrow',
    unread_count: 0,
    is_muted: false,
    is_pinned: true,
    is_archived: false,
    draft: null,
    created_at: Date.now() - 172800000,
    updated_at: Date.now(),
    members: [{ user_id: 'mock-peer-2' }],
  },
];

const mockMessagesByChat: Record<string, Array<Record<string, unknown>>> = {
  'mock-chat-1': [
    {
      id: 'mock-msg-1',
      chat_id: 'mock-chat-1',
      sender_id: MOCK_PEER_ID,
      msg_type: 'text',
      content: 'Hello!',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 120000,
      updated_at: Date.now() - 120000,
    },
    {
      id: 'mock-msg-2',
      chat_id: 'mock-chat-1',
      sender_id: MOCK_USER_ID,
      msg_type: 'text',
      content: 'Hello! How are you?',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 60000,
      updated_at: Date.now() - 60000,
    },
  ],
  'mock-chat-2': [
    {
      id: 'mock-msg-3',
      chat_id: 'mock-chat-2',
      sender_id: 'mock-peer-2',
      msg_type: 'text',
      content: 'Remind me, what time?',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 7200000,
      updated_at: Date.now() - 7200000,
    },
    {
      id: 'mock-msg-4',
      chat_id: 'mock-chat-2',
      sender_id: MOCK_USER_ID,
      msg_type: 'text',
      content: 'See you tomorrow',
      reply_to_id: null,
      is_edited: 0,
      is_deleted: 0,
      status: 'delivered',
      transport: 'server',
      server_id: null,
      created_at: Date.now() - 3600000,
      updated_at: Date.now() - 3600000,
    },
  ],
};

const mockCurrentUser = {
  id: MOCK_USER_ID,
  loginus_id: null,
  username: 'me',
  handle: 'myhandle',
  display_name: 'Me',
  avatar_url: null,
  phone: null,
  is_online: true,
  last_seen: null,
  created_at: Date.now() - 86400000,
  updated_at: Date.now(),
};

const mockUsers = [
  {
    id: MOCK_PEER_ID,
    loginus_id: null,
    username: 'alice',
    handle: 'alice',
    display_name: 'Alice',
    avatar_url: null,
    phone: null,
    is_online: true,
    last_seen: null,
    created_at: Date.now() - 86400000,
    updated_at: Date.now(),
  },
  {
    id: 'mock-peer-2',
    loginus_id: null,
    username: 'bob',
    handle: 'bob',
    display_name: 'Bob',
    avatar_url: null,
    phone: null,
    is_online: false,
    last_seen: Date.now() - 3600000,
    created_at: Date.now() - 172800000,
    updated_at: Date.now(),
  },
  {
    id: 'mock-peer-3',
    loginus_id: null,
    username: 'charlie',
    handle: 'charlie',
    display_name: 'Charlie',
    avatar_url: null,
    phone: null,
    is_online: true,
    last_seen: null,
    created_at: Date.now() - 259200000,
    updated_at: Date.now(),
  },
];

let dynamicChats = [...mockChats];
let dynamicMessages: Record<string, Array<Record<string, unknown>>> = JSON.parse(
  JSON.stringify(mockMessagesByChat)
);

function createMockResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mockApiGet(path: string): Promise<Response> {
  // GET /chats
  if (path === '/chats' || path.startsWith('/chats?')) {
    return createMockResponse(dynamicChats);
  }

  // GET /chats/:id/messages?limit=30&before=?
  const messagesMatch = path.match(/^\/chats\/([^/]+)\/messages\?/);
  if (messagesMatch) {
    const chatId = messagesMatch[1];
    const msgs = dynamicMessages[chatId] ?? [];
    return createMockResponse(msgs);
  }

  // GET /users/me
  if (path === '/users/me') {
    return createMockResponse(mockCurrentUser);
  }

  // GET /users/search?q=...
  if (path.startsWith('/users/search')) {
    const url = new URL(path, 'http://localhost');
    const q = (url.searchParams.get('q') ?? '').toLowerCase().trim().replace(/^@+/, '');
    if (!q) return createMockResponse([]);
    const filtered = mockUsers.filter(
      (u) =>
        (u.username?.toLowerCase().includes(q) ?? false) ||
        (u.display_name?.toLowerCase().includes(q) ?? false) ||
        (u.handle?.toLowerCase().includes(q) ?? false)
    );
    return createMockResponse(filtered);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mockApiPatch(
  path: string,
  body?: unknown
): Promise<Response> {
  // PATCH /users/me
  if (path === '/users/me' && body && typeof body === 'object') {
    const b = body as { display_name?: string; avatar_url?: string; handle?: string };
    Object.assign(mockCurrentUser, {
      display_name: b.display_name ?? mockCurrentUser.display_name,
      avatar_url: b.avatar_url ?? mockCurrentUser.avatar_url,
      handle: b.handle ?? mockCurrentUser.handle,
      updated_at: Date.now(),
    });
    return createMockResponse(mockCurrentUser);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function mockApiPost(
  path: string,
  body?: unknown
): Promise<Response> {
  // POST /chats
  if (path === '/chats' && body && typeof body === 'object') {
    const b = body as { chat_type?: string; member_ids?: string[] };
    const memberIds = b.member_ids ?? [];
    const peerId = memberIds[0] ?? 'mock-new-peer';
    const peer = mockUsers.find((u) => u.id === peerId) ?? {
      id: peerId,
      username: peerId,
      display_name: peerId,
    };

    const peerName = peer.display_name ?? peer.username ?? peerId;
    const newChat = {
      id: `mock-chat-${Date.now()}`,
      chat_type: b.chat_type ?? 'private',
      name: peerName,
      avatar_url: null,
      created_by_id: MOCK_USER_ID,
      last_message_id: null,
      pinned_message_id: null,
      last_message_at: null,
      last_message_preview: null,
      unread_count: 0,
      is_muted: false,
      is_pinned: false,
      is_archived: false,
      draft: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      members: [{ user_id: peerId }],
    };

    dynamicChats = [newChat, ...dynamicChats];
    dynamicMessages[newChat.id] = [];

    return createMockResponse(newChat);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
