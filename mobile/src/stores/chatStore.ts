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
  updateChat: (chat: Chat) => void;
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

  updateChat: (chat) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chat.id ? chat : c)),
    })),

  setSelectedChat: (id) => set({ selectedChatId: id }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearChats: () => set(initialState),
}));
