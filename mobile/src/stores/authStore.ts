import { create } from 'zustand';
import type { User } from './types';
import { authService, apiUserToUserRow } from '../services/AuthService';

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
};

type AuthActions = {
  setSession: (user: User, accessToken: string) => void;
  clearSession: () => void;
  restoreSession: () => Promise<void>;
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
};

export const authStore = create<AuthState & AuthActions>((set) => ({
  ...initialState,

  setSession: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true }),

  clearSession: () => set(initialState),

  restoreSession: async () => {
    const session = await authService.restoreSession();
    if (session) {
      const userRow = apiUserToUserRow(session.user);
      set({ user: userRow, accessToken: session.accessToken, isAuthenticated: true });
    } else {
      set(initialState);
    }
  },
}));
