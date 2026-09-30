import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuthStore } from './auth-store';
import { ensureProfile } from './ensure-profile';
import { FeedMatch, PlayerStats, Profile } from './types';

/** Calls an Edge Function and surfaces its `{ error }` message on failure. */
export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        // Not JSON; keep the generic message.
      }
    }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(String(data.error));
  return data as T;
}

/** Calls an RPC and throws the Postgres error message. */
export async function rpc<T = any>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const PROFILE_COLUMNS = 'user_id,display_name,avatar_url,created_at,notify_waitlist,notify_teams,notify_chat,notify_matches,locale,onboarded';

export function useProfile() {
  const session = useAuthStore((s) => s.session);
  return useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      await ensureProfile(session!.user.id, session!.user.email);
      const { data, error } = await supabase.from('profile').select(PROFILE_COLUMNS).eq('user_id', session!.user.id).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

/** G1: every match in every group the player belongs to. */
export function useFeed() {
  const session = useAuthStore((s) => s.session);
  return useQuery({
    queryKey: ['feed', session?.user.id],
    enabled: !!session?.user.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const rows = await rpc<FeedMatch[]>('match_feed');
      return rows.map((m) => ({ ...m, fee_amount: Number(m.fee_amount) }));
    },
  });
}

export function usePlayerStats(groupId: string | undefined) {
  const session = useAuthStore((s) => s.session);
  return useQuery({
    queryKey: ['player-stats', groupId, session?.user.id],
    enabled: !!groupId && !!session?.user.id,
    queryFn: () => rpc<PlayerStats>('player_stats', { g: groupId }),
  });
}

/** Query keys that depend on a player's match signups. */
export const MATCH_KEYS = ['feed', 'match', 'signups', 'teams', 'team-summary', 'match-summary', 'player-stats'];
