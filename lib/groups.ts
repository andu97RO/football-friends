import { useQuery } from '@tanstack/react-query';
import { rpc } from './api';
import { useAuthStore } from './auth-store';
import { ensureProfile } from './ensure-profile';
import { supabase } from './supabase';
import { GroupMember, GroupRole, MyGroup } from './types';
import { appUrl } from './utils';

export const GROUP_KEYS = ['my-groups', 'group-members', 'group-role', 'group-invite', 'feed'];

/** The caller's groups (approved and pending), with their own rating. */
export function useGroups() {
  const session = useAuthStore((s) => s.session);
  const query = useQuery({
    queryKey: ['my-groups', session?.user.id],
    enabled: !!session?.user.id,
    refetchInterval: 30000,
    queryFn: async () => {
      await ensureProfile(session!.user.id, session!.user.email);
      return rpc<MyGroup[]>('my_groups');
    },
  });
  const approved = query.data?.filter((g) => g.status === 'approved') ?? [];
  const pending = query.data?.filter((g) => g.status === 'pending') ?? [];
  const adminOf = approved.filter((g) => g.role === 'owner' || g.role === 'admin');
  const pendingRequests = adminOf.reduce((sum, g) => sum + g.pending_requests, 0);
  return { ...query, approved, pending, adminOf, pendingRequests };
}

export function isAdminRole(role: GroupRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function useGroupRole(groupId: string | undefined) {
  const session = useAuthStore((s) => s.session);
  return useQuery({
    queryKey: ['group-role', groupId, session?.user.id],
    enabled: !!groupId && !!session?.user.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from('group_membership').select('role,status')
        .eq('club_id', groupId!).eq('user_id', session!.user.id).maybeSingle();
      if (error) throw error;
      return data?.status === 'approved' ? (data.role as GroupRole) : null;
    },
  });
}

export function useGroupMembers(groupId: string | undefined) {
  const session = useAuthStore((s) => s.session);
  return useQuery({
    queryKey: ['group-members', groupId, session?.user.id],
    enabled: !!groupId && !!session?.user.id,
    queryFn: () => rpc<GroupMember[]>('group_members', { g: groupId }),
  });
}

export function groupAction(args: { action: string; g?: string | null; target?: string; value?: string; description?: string }) {
  return rpc<string>('group_action', args);
}

/** Shareable invite link for a group code (M8). */
export function inviteUrl(code: string): string {
  return appUrl(`/join/${code}`);
}
