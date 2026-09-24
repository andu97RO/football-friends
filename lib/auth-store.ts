import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null | undefined;
  recovery: boolean;
  setRecovery: (recovery: boolean) => void;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  recovery: false,
  setRecovery: (recovery) => set({ recovery }),
  session: undefined, // undefined = loading, null = not authenticated
  setSession: (session) => set({ session }),
}));
