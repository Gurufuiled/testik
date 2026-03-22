import { create } from 'zustand';
import type { Chat } from './types';

type ChatState = {
  chats: Chat[];
  selectedChatId: string | null;
  isLoading: boolean;
};

type ChatActions = {
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  addOrUpdateChat: (chat: Chat) => void;
  updateChat: (chat: Chat) => void;
  removeChat: (chatId: string) => void;
  setSelectedChat: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  clearChats: () => void;
};

const initialState: ChatState = {
  chats: [],
  selectedChatId: null,
  isLoading: false,
};

export const chatStore = create<ChatState & ChatActions>((set) => ({
  ...initialState,

  setChats: (chats) => set({ chats }),

  addChat: (chat) =>
    set((state) => ({
      chats: state.chats.some((c) => c.id === chat.id)
        ? state.chats
        : [...state.chats, chat],
    })),

  addOrUpdateChat: (chat) =>
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      if (idx >= 0) {
        const next = [...state.chats];
        next[idx] = chat;
        return { chats: next };
      }
      return { chats: [chat, ...state.chats] };
    }),

  updateChat: (chat) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chat.id ? chat : c)),
    })),

  removeChat: (chatId) =>
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      selectedChatId: state.selectedChatId === chatId ? null : state.selectedChatId,
    })),

  setSelectedChat: (id) => set({ selectedChatId: id }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearChats: () => set(initialState),
}));
