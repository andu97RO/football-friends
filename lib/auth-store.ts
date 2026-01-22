import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null | undefined;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: undefined, // undefined = loading, null = not authenticated
  setSession: (session) => set({ session }),
}));
