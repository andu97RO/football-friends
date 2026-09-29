import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuthStore } from './auth-store';
import { ensureProfile } from './ensure-profile';
import { GroupMembership, Profile } from './types';

export const useGroupStore = create<{ selectedId: string | null; select: (id: string | null) => void }>((set) => ({
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}));

export function useGroups() {
  const session = useAuthStore((s) => s.session);
  const { selectedId, select } = useGroupStore();
  const query = useQuery({
    queryKey: ['my-groups', session?.user.id],
    enabled: !!session?.user.id,
    refetchInterval: 15000,
    queryFn: async () => {
      await ensureProfile(session!.user.id, session!.user.email);
      const { data, error } = await supabase.from('group_membership')
        .select('*, club(id,name,description)').eq('user_id', session!.user.id).order('created_at');
      if (error) throw error;
      return data as GroupMembership[];
    },
  });
  const approved = query.data?.filter((m) => m.status === 'approved') ?? [];
  const current = approved.find((m) => m.club_id === selectedId) ?? approved[0];
  return { ...query, current, approved, select, isAdmin: current?.role === 'owner' || current?.role === 'admin' };
}

export function useGroupRole(groupId: string | undefined) {
  const session = useAuthStore((s) => s.session);
  return useQuery({
    queryKey: ['group-role', groupId, session?.user.id],
    enabled: !!groupId && !!session?.user.id,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from('group_membership').select('role,status')
        .eq('club_id', groupId!).eq('user_id', session!.user.id).maybeSingle();
      if (error) throw error;
      return data?.status === 'approved' ? data.role as GroupMembership['role'] : null;
    },
  });
}

export async function groupPlayers(groupId: string) {
  const { data: members, error } = await supabase.from('group_membership').select('*').eq('club_id', groupId);
  if (error) throw error;
  if (!members?.length) return [];
  const { data: profiles, error: profileError } = await supabase.from('profile')
    .select('user_id,display_name,avatar_url,created_at').in('user_id', members.map((m) => m.user_id));
  if (profileError) throw profileError;
  return members.map((m) => ({ ...m, ...profiles?.find((p) => p.user_id === m.user_id), rating_base: m.rating })) as (GroupMembership & Profile)[];
}
