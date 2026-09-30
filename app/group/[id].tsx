import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, Share, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { rpc } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { GROUP_KEYS, groupAction, inviteUrl, isAdminRole, useGroupMembers, useGroups } from '@/lib/groups';
import { useT } from '@/lib/i18n';
import { confirm, showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { shareToWhatsApp } from '@/lib/matches';
import { GroupMember } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import {
  Avatar, Button, Card, EmptyState, ErrorState, Field, ListGroup, ListRow, LoadingState, RatingPicker, ratingLabel,
  Screen, ScreenHeader, SectionHeader, Sheet, Txt,
} from '@/components/ui';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const myId = session?.user.id;
  const groups = useGroups();
  const group = groups.data?.find((g) => g.club_id === id && g.status === 'approved');
  const isAdmin = isAdminRole(group?.role);
  const isOwner = group?.role === 'owner';
  const members = useGroupMembers(group ? id : undefined);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GroupMember | null>(null);

  const invite = useQuery({
    queryKey: ['group-invite', id],
    enabled: isAdmin,
    queryFn: () => rpc<string>('group_invite', { g: id }),
  });

  const refresh = () => Promise.all(GROUP_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
  const act = useMutation({
    mutationFn: groupAction,
    onSuccess: () => void refresh(),
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (members.data ?? []).filter((m) => m.status === 'approved' && (!term || m.display_name.toLowerCase().includes(term)));
  }, [members.data, search]);
  const requests = (members.data ?? []).filter((m) => m.status === 'pending');

  if (session === null || (session && !isVerifiedSession(session))) return <Redirect href="/login" />;
  if (groups.isLoading) return <Screen header={<ScreenHeader back />}><LoadingState /></Screen>;
  if (!group) {
    return <Screen header={<ScreenHeader back />}><EmptyState icon="people-outline" title={t('groups.notMember')} body={t('groups.notMemberBody')} /></Screen>;
  }

  const link = invite.data ? inviteUrl(invite.data) : null;
  const shareInvite = () => {
    if (!link) return;
    const text = t('groups.inviteMessage', { name: group.name, link, code: invite.data });
    if (Platform.OS === 'web') void shareToWhatsApp(text);
    else void Share.share({ message: text });
  };
  const copyInvite = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    showToast(t('groups.linkCopied'));
  };

  const leave = async () => {
    const ok = await confirm({
      title: t('groups.leaveTitle', { name: group.name }),
      message: t('groups.leaveBody'),
      cancelLabel: t('groups.stay'),
      confirmLabel: t('groups.leave'),
      destructive: true,
    });
    if (ok) act.mutate({ action: 'leave', g: id }, { onSuccess: () => router.replace('/(tabs)/groups') });
  };

  return (
    <Screen
      header={<ScreenHeader back title={isAdmin ? t('groups.manageTitle') : group.name} titleVariant="title" subtitle={`${isAdmin ? `${group.name} · ` : ''}${t('groups.memberCount', { count: group.member_count })}`} />}
      testID="group-screen"
      refreshControl={<RefreshControl refreshing={members.isRefetching} onRefresh={() => { void members.refetch(); void groups.refetch(); }} tintColor={theme.colors.primary} />}
    >
      {/* M8: organisers invite with a link; the invited player skips search and approval. */}
      {isAdmin && (
        <Card style={{ gap: 12 }} testID="invite-card">
          <Txt variant="label" tone="secondary">{t('groups.inviteTitle')}</Txt>
          <Txt variant="body" tone="secondary">{t('groups.inviteHelp')}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel={t('groups.copyLink')} onPress={copyInvite} style={styles.code}>
            <Txt variant="display" style={{ letterSpacing: 4 }} selectable testID="invite-code">{invite.data ?? '········'}</Txt>
            <Ionicons name="copy-outline" size={20} color={theme.colors.textSecondary} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={t('groups.shareInvite')} icon="share-social-outline" onPress={shareInvite} disabled={!link} style={{ flex: 1 }} testID="share-invite" />
            <Button title={t('groups.copyLink')} icon="link-outline" variant="secondary" onPress={copyInvite} disabled={!link} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {isAdmin && requests.length > 0 && (
        <>
          <SectionHeader title={t('groups.requestsCount', { count: requests.length })} />
          {requests.map((r) => (
            <Card key={r.user_id} style={{ gap: 12 }} testID={`request-${r.user_id}`}>
              <View style={styles.memberHead}>
                <Avatar name={r.display_name} url={r.avatar_url} seed={r.user_id} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="heading">{r.display_name}</Txt>
                  {/* G6: "Self-rated 3/5", not "says 3/5". */}
                  <Txt variant="caption" tone="secondary">
                    {t('groups.askedAgo', { when: relativeTime(r.created_at, new Date()) })} · {t('groups.selfRated', { rating: ratingLabel(r.self_rating) })}
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title={t('groups.reject')} variant="secondary" size="m" style={{ flex: 1 }} onPress={() => act.mutate({ action: 'review', g: id, target: r.user_id, value: 'rejected' })} />
                <Button title={t('groups.approve')} size="m" style={{ flex: 2 }} onPress={() => act.mutate({ action: 'review', g: id, target: r.user_id, value: 'approved' })} testID={`approve-${r.user_id}`} />
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionHeader title={t('groups.members')} />
      {isAdmin && <Txt variant="caption" tone="secondary">{t('rating.model')}</Txt>}
      {(members.data?.length ?? 0) > 8 && (
        <Field placeholder={t('groups.searchMembers')} value={search} onChangeText={setSearch} icon="search" accessibilityLabel={t('groups.searchMembers')} testID="member-search" />
      )}
      {members.isLoading ? (
        <LoadingState />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <ListGroup>
          {filtered.map((m) => (
            <MemberRow key={m.user_id} member={m} me={m.user_id === myId} isAdmin={isAdmin} onPress={isAdmin ? () => setEditing(m) : undefined} />
          ))}
          {filtered.length === 0 && <ListRow kind="static" title={t('groups.noMembersFound')} />}
        </ListGroup>
      )}

      {isAdmin && (
        <>
          <SectionHeader title={t('groups.settings')} />
          <ListGroup>
            <ListRow
              kind="toggle"
              icon="search-outline"
              title={t('groups.listed')}
              subtitle={t('groups.listedHelp')}
              toggled={group.listed}
              onToggle={(v) => act.mutate({ action: 'listed', g: id, value: String(v) })}
            />
            <ListRow
              kind="action"
              icon="refresh-outline"
              title={t('groups.resetCode')}
              subtitle={t('groups.resetCodeHelp')}
              onPress={async () => {
                const ok = await confirm({ title: t('groups.resetCode'), message: t('groups.resetCodeHelp'), cancelLabel: t('common.cancel'), confirmLabel: t('groups.resetCodeConfirm') });
                if (ok) act.mutate({ action: 'reset_code', g: id });
              }}
            />
          </ListGroup>
        </>
      )}
      {!isOwner && <Button title={t('groups.leave')} variant="dangerGhost" size="m" onPress={leave} style={{ alignSelf: 'center' }} />}

      <MemberSheet member={editing} groupId={id} isOwner={isOwner} myId={myId} onClose={() => setEditing(null)} />
    </Screen>
  );
}

/** G5: rows show the value; editing happens in a sheet, not with 132 live buttons. */
function MemberRow({ member, me, isAdmin, onPress }: { member: GroupMember; me: boolean; isAdmin: boolean; onPress?: () => void }) {
  const t = useT();
  const content = (
    <>
      <Avatar name={member.display_name} url={member.avatar_url} seed={member.user_id} size={36} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" style={me ? { color: theme.colors.primaryText } : undefined}>
          {member.display_name}{me ? ` (${t('common.youLower')})` : ''}
        </Txt>
        <Txt variant="caption" tone="secondary">{t(`role.${member.role}`)}</Txt>
      </View>
      {isAdmin && <Txt variant="number" style={{ fontSize: 20 }}>{ratingLabel(member.rating)}</Txt>}
      {onPress && <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
    </>
  );
  if (!onPress) return <View style={styles.memberRow}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('groups.editMember', { name: member.display_name })} onPress={onPress} style={styles.memberRow} testID={`member-${member.user_id}`}>
      {content}
    </Pressable>
  );
}

function MemberSheet({ member, groupId, isOwner, myId, onClose }: { member: GroupMember | null; groupId: string; isOwner: boolean; myId?: string; onClose: () => void }) {
  const t = useT();
  const client = useQueryClient();
  const [rating, setRating] = useState<number | null>(null);
  const current = rating ?? member?.rating ?? null;
  const refresh = () => Promise.all(GROUP_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
  const act = useMutation({
    mutationFn: groupAction,
    onSuccess: () => void refresh(),
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });
  if (!member) return null;

  const close = () => {
    setRating(null);
    onClose();
  };

  // D5 G5: one control, saved explicitly, with undo.
  const saveRating = () => {
    const previous = member.rating;
    if (current === null || current === previous) return close();
    act.mutate(
      { action: 'rating', g: groupId, target: member.user_id, value: String(current) },
      {
        onSuccess: () => {
          showToast(t('groups.ratingSaved', { name: member.display_name, rating: ratingLabel(current) }), {
            action: previous === null ? undefined : { label: t('common.undo'), onPress: () => act.mutate({ action: 'rating', g: groupId, target: member.user_id, value: String(previous) }) },
          });
          close();
        },
      }
    );
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('groups.removeTitle', { name: member.display_name }),
      message: t('groups.removeBody'),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('groups.remove'),
      destructive: true,
    });
    if (ok) act.mutate({ action: 'remove', g: groupId, target: member.user_id }, { onSuccess: close });
  };

  const canChangeRole = isOwner && member.role !== 'owner';
  const canRemove = member.user_id !== myId && member.role !== 'owner' && (isOwner || member.role === 'member');

  return (
    <Sheet visible onClose={close} title={member.display_name} subtitle={`${t(`role.${member.role}`)} · ${t('groups.selfRated', { rating: ratingLabel(member.self_rating) })}`} testID="member-sheet">
      <View style={{ gap: 8 }}>
        <Txt variant="label" tone="secondary">{t('groups.groupRating')}</Txt>
        <RatingPicker value={current} onChange={setRating} disabled={act.isPending} />
      </View>
      <Button title={t('groups.saveRating')} onPress={saveRating} loading={act.isPending} disabled={current === member.rating} testID="save-rating" />
      {(canChangeRole || canRemove) && (
        <ListGroup>
          {canChangeRole && (
            // G6: label by outcome.
            <ListRow
              kind="action"
              icon={member.role === 'admin' ? 'shield-outline' : 'shield-checkmark-outline'}
              title={member.role === 'admin' ? t('groups.removeAdmin') : t('groups.makeAdmin')}
              onPress={() => act.mutate({ action: 'role', g: groupId, target: member.user_id, value: member.role === 'admin' ? 'member' : 'admin' }, { onSuccess: close })}
            />
          )}
          {canRemove && <ListRow kind="action" icon="person-remove-outline" tone="danger" title={t('groups.removeFromGroup')} onPress={remove} />}
        </ListGroup>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  code: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 16,
    borderRadius: theme.borderRadius.m, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.borderStrong,
  },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: theme.spacing.m },
});
