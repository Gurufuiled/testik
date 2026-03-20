import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type ConnectionStatus = 'offline' | 'connecting' | 'online';
export type P2PState = 'disconnected' | 'connecting' | 'connected';

export type TypingEntry = { userId: string; at: number };
export type PresenceEntry = { is_online: boolean; last_seen?: number };

type UIState = {
  connectionStatus: ConnectionStatus;
  p2pStates: Record<string, P2PState>;
  transportStatusVersion: number;
  activeModal: string | null;
  typingUsersByChatId: Record<string, TypingEntry[]>;
  presenceByUserId: Record<string, PresenceEntry>;
  pinnedMessageIdByChatId: Record<string, string | null>;
  isPinnedMessagesHydrated: boolean;
};

type UIActions = {
  setConnectionStatus: (status: ConnectionStatus) => void;
  setP2PState: (peerId: string, state: P2PState) => void;
  bumpTransportStatus: () => void;
  setActiveModal: (modalId: string | null) => void;
  clearActiveModal: () => void;
  setTypingUser: (chatId: string, userId: string) => void;
  clearStaleTyping: (staleMs?: number) => void;
  setPresence: (userId: string, entry: PresenceEntry) => void;
  setPinnedMessage: (chatId: string, messageId: string | null) => void;
  hydratePinnedMessages: () => Promise<void>;
};

const TYPING_STALE_MS = 5000;
const PINNED_MESSAGES_KEY = 'ui.pinnedMessageIdByChatId';

const initialState: UIState = {
  connectionStatus: 'offline',
  p2pStates: {},
  transportStatusVersion: 0,
  activeModal: null,
  typingUsersByChatId: {},
  presenceByUserId: {},
  pinnedMessageIdByChatId: {},
  isPinnedMessagesHydrated: false,
};

export const uiStore = create<UIState & UIActions>((set) => ({
  ...initialState,

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setP2PState: (peerId, state) =>
    set((s) => ({
      p2pStates: { ...s.p2pStates, [peerId]: state },
    })),

  bumpTransportStatus: () =>
    set((s) => ({ transportStatusVersion: s.transportStatusVersion + 1 })),

  setActiveModal: (modalId) => set({ activeModal: modalId }),

  clearActiveModal: () => set({ activeModal: null }),

  setTypingUser: (chatId, userId) =>
    set((s) => {
      const now = Date.now();
      const existing = s.typingUsersByChatId[chatId] ?? [];
      const filtered = existing.filter((e) => e.userId !== userId);
      const next = [...filtered, { userId, at: now }];
      return {
        typingUsersByChatId: { ...s.typingUsersByChatId, [chatId]: next },
      };
    }),

  clearStaleTyping: (staleMs = TYPING_STALE_MS) =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, TypingEntry[]> = {};
      for (const [chatId, entries] of Object.entries(s.typingUsersByChatId)) {
        const fresh = entries.filter((e) => now - e.at < staleMs);
        if (fresh.length > 0) next[chatId] = fresh;
      }
      return { typingUsersByChatId: next };
    }),

  setPresence: (userId, entry) =>
    set((s) => ({
      presenceByUserId: { ...s.presenceByUserId, [userId]: entry },
    })),

  setPinnedMessage: (chatId, messageId) =>
    set((s) => {
      const next = {
        ...s.pinnedMessageIdByChatId,
        [chatId]: messageId,
      };
      void SecureStore.setItemAsync(PINNED_MESSAGES_KEY, JSON.stringify(next)).catch(() => {});
      return {
        pinnedMessageIdByChatId: next,
      };
    }),

  hydratePinnedMessages: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PINNED_MESSAGES_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
      set({
        pinnedMessageIdByChatId: parsed,
        isPinnedMessagesHydrated: true,
      });
    } catch {
      set({ isPinnedMessagesHydrated: true });
    }
  },
}));
