import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'footy.pendingInvite';

/**
 * M8: an invite link opened before signing in is remembered, so the player
 * lands on the group after sign-in instead of searching for it.
 */
export const usePendingInvite = create<{ code: string | null; set: (code: string | null) => void }>((set) => ({
  code: null,
  set: (code) => {
    set({ code });
    (code ? AsyncStorage.setItem(KEY, code) : AsyncStorage.removeItem(KEY)).catch(() => undefined);
  },
}));

export async function loadPendingInvite(): Promise<void> {
  try {
    const code = await AsyncStorage.getItem(KEY);
    if (code) usePendingInvite.setState({ code });
  } catch {
    // Storage unavailable; the player can paste the code instead.
  }
}

/** Accepts a full invite link or a bare code. */
export function parseInviteCode(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/join\/([A-Za-z0-9]+)/);
  return (match ? match[1] : trimmed).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
