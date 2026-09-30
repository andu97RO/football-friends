import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { teamColor, theme } from '@/constants/theme';
import { rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { isAdminRole, useGroupRole } from '@/lib/groups';
import { formatDate, useLocaleStore, useT } from '@/lib/i18n';
import { confirm, showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { shareToWhatsApp, useInvalidateMatch } from '@/lib/matches';
import { firstName, teamLabel } from '@/lib/utils';
import { Avatar, Button, Card, EmptyState, ErrorState, IconButton, LoadingState, Screen, ScreenHeader, Sheet, Txt } from '@/components/ui';

type Player = { user_id: string; name: string; avatar_url: string | null; rating: number | null };
type TeamView = { id: string; name: string; index: number; players: Player[]; avg: number | null };

const FAIR_GAP = 0.3;

function average(players: Player[]): number | null {
  const rated = players.filter((p) => p.rating !== null);
  if (!rated.length) return null;
  return rated.reduce((sum, p) => sum + (p.rating ?? 0), 0) / rated.length;
}

function gapOf(avgs: (number | null)[]): number {
  const values = avgs.filter((a): a is number => a !== null);
  // Rounded to the one decimal we display, so a shown "0.3" is judged as 0.3.
  return values.length > 1 ? Math.round((Math.max(...values) - Math.min(...values)) * 10) / 10 : 0;
}

export default function TeamsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const session = useAuthStore((s) => s.session);
  const myId = session?.user.id;
  const invalidate = useInvalidateMatch();
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<[string, string][]>([]);
  const [picked, setPicked] = useState<Player | null>(null);

  const query = useQuery({
    queryKey: ['teams-view', id, myId],
    enabled: isVerifiedSession(session),
    queryFn: async () => {
      const { data: match, error } = await supabase.from('match').select('id,club_id,kick_off,status,venue_name').eq('id', id).single();
      if (error) throw error;
      const [{ data: teams, error: teamError }, summary, { data: snapshots }] = await Promise.all([
        supabase.from('team').select('id,name,team_assignment(user_id)').eq('match_id', id).order('name'),
        rpc<{ team_id: string; avg_rating: number; players: number }[]>('team_summary', { m: id }),
        // M17: admins can read every snapshot; players only their own.
        supabase.from('rating_snapshot').select('user_id,rating_display').eq('match_id', id),
      ]);
      if (teamError) throw teamError;
      const ids = (teams ?? []).flatMap((team) => team.team_assignment.map((a: { user_id: string }) => a.user_id));
      const { data: profiles } = ids.length
        ? await supabase.from('profile').select('user_id,display_name,avatar_url').in('user_id', ids)
        : { data: [] as { user_id: string; display_name: string; avatar_url: string | null }[] };
      return { match, teams: teams ?? [], summary, snapshots: snapshots ?? [], profiles: profiles ?? [] };
    },
  });
  const { data: role } = useGroupRole(query.data?.match.club_id);
  const isAdmin = isAdminRole(role);

  const teams: TeamView[] = useMemo(() => {
    if (!query.data) return [];
    const { teams, summary, snapshots, profiles } = query.data;
    return teams.map((team, index) => {
      const players = team.team_assignment.map((a: { user_id: string }) => {
        const profile = profiles.find((p) => p.user_id === a.user_id);
        const snap = snapshots.find((s) => s.user_id === a.user_id);
        return { user_id: a.user_id, name: profile?.display_name ?? '?', avatar_url: profile?.avatar_url ?? null, rating: isAdmin && snap ? snap.rating_display : null };
      });
      const server = summary.find((s) => s.team_id === team.id)?.avg_rating;
      return { id: team.id, name: teamLabel(team.name), index, players, avg: isAdmin ? average(players) : server !== undefined ? Number(server) : null };
    });
  }, [query.data, isAdmin]);

  const swap = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string; record: boolean }) => rpc('swap_players', { m: id, a, b }),
    onSuccess: (_data, { a, b, record }) => {
      if (record) setHistory((h) => [...h, [a, b]]);
      setPicked(null);
      void query.refetch();
      void invalidate();
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  const regenerate = useMutation({
    mutationFn: () => rpc('match_action', { action: 'regenerate', m: id }),
    onSuccess: () => {
      setHistory([]);
      void query.refetch();
      void invalidate();
      showToast(t('teams.regenerated'));
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  if (session === null || (session && !isVerifiedSession(session))) return <Redirect href="/login" />;
  if (query.isLoading) return <Screen header={<ScreenHeader back />}><LoadingState /></Screen>;
  if (query.error || !query.data) return <Screen header={<ScreenHeader back />}><ErrorState error={query.error} onRetry={() => query.refetch()} /></Screen>;
  const { match } = query.data;
  if (teams.length === 0) {
    return <Screen header={<ScreenHeader back title={t('match.teams')} />}><EmptyState icon="shirt-outline" title={t('teams.notYet')} body={t('teams.notYetBody')} /></Screen>;
  }

  const kicked = new Date(match.kick_off).getTime() <= Date.now();
  const canEdit = isAdmin && match.status === 'locked';
  const gap = gapOf(teams.map((team) => team.avg));
  const when = `${formatDate.day(match.kick_off, locale)} · ${formatDate.time(match.kick_off, locale)}`;

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    swap.mutate({ a: last[0], b: last[1], record: false });
  };

  const cancelEdits = async () => {
    for (const [a, b] of [...history].reverse()) {
      await rpc('swap_players', { m: id, a, b }).catch((error: Error) => showAlert(t('common.errorTitle'), error.message));
    }
    setHistory([]);
    setEditing(false);
    void query.refetch();
    void invalidate();
  };

  const askRegenerate = async () => {
    const ok = await confirm({ title: t('teams.regenerateTitle'), message: t('teams.regenerateBody'), cancelLabel: t('common.cancel'), confirmLabel: t('teams.regenerate') });
    if (ok) regenerate.mutate();
  };

  const share = () => {
    const lines = [`⚽ ${when}${match.venue_name ? ` · ${match.venue_name}` : ''}`, ''];
    teams.forEach((team) => {
      lines.push(`${team.name}: ${team.players.map((p) => firstName(p.name)).join(', ')}`);
    });
    void shareToWhatsApp(lines.join('\n'));
  };

  return (
    <Screen
      header={
        <ScreenHeader
          back={!editing}
          title={editing ? t('teams.editTitle') : t('match.teams')}
          subtitle={editing ? t('teams.editHint') : `${match.status === 'completed' ? t('status.played') : t('status.teamsPicked')} · ${when}`}
          titleVariant="title"
          right={
            editing ? (
              <Button title={t('common.done')} size="m" onPress={() => { setEditing(false); setHistory([]); }} testID="teams-done" />
            ) : (
              <>
                <IconButton icon="logo-whatsapp" accessibilityLabel={t('share.whatsapp')} onPress={share} testID="share-teams" />
                {canEdit && <Button title={t('common.edit')} icon="create-outline" variant="secondary" size="m" onPress={() => setEditing(true)} testID="edit-teams" />}
              </>
            )
          }
        />
      }
      testID="teams-screen"
    >
      {/* T1: the gap between teams is the signal; no near-identical bars. */}
      <Card style={styles.balance} testID="balance">
        <Ionicons name={gap <= FAIR_GAP ? 'checkmark-circle' : 'alert-circle'} size={22} color={gap <= FAIR_GAP ? theme.colors.success : theme.colors.warning} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{gap <= FAIR_GAP ? t('teams.fair', { gap: gap.toFixed(1) }) : t('teams.uneven', { gap: gap.toFixed(1) })}</Txt>
          <Txt variant="caption" tone="secondary">{t('teams.balanceHelp')}</Txt>
        </View>
      </Card>

      {editing && (
        <View style={styles.editBar}>
          <Button title={t('common.undo')} icon="arrow-undo-outline" variant="secondary" size="m" disabled={!history.length || swap.isPending} onPress={undo} style={{ flex: 1 }} testID="teams-undo" />
          <Button title={t('teams.cancelChanges')} variant="secondary" size="m" disabled={!history.length || swap.isPending} onPress={cancelEdits} style={{ flex: 1 }} />
        </View>
      )}

      {teams.map((team) => (
        <Card key={team.id} style={{ gap: 4 }} testID={`team-${team.index}`}>
          <View style={styles.teamHead}>
            <View style={[styles.dot, { backgroundColor: teamColor(team.index) }]} />
            <Txt variant="title" style={{ flex: 1 }}>{team.name}</Txt>
            {team.avg !== null && (
              <Txt variant="caption" tone="secondary">
                {t('teams.avg')} <Txt variant="number" style={{ fontSize: 22 }}>{team.avg.toFixed(1)}</Txt>
              </Txt>
            )}
          </View>
          {/* T3: one column, each rating attached to its own name. */}
          {team.players.map((p) => {
            const isMe = p.user_id === myId;
            const Row = editing ? Pressable : View;
            return (
              <Row
                key={p.user_id}
                style={[styles.player, editing && styles.playerEditable]}
                {...(editing ? { onPress: () => setPicked(p), accessibilityRole: 'button' as const, accessibilityLabel: t('teams.swapWith', { name: p.name }) } : {})}
              >
                <Avatar name={p.name} url={p.avatar_url} seed={p.user_id} size={30} />
                <Txt variant="bodyStrong" style={[{ flexShrink: 1 }, isMe && { color: theme.colors.primaryText }]} numberOfLines={1}>
                  {p.name}{isMe ? ` (${t('common.youLower')})` : ''}
                </Txt>
                {p.rating !== null && <Txt variant="caption" style={styles.rating}>{p.rating}</Txt>}
                <View style={{ flex: 1 }} />
                {editing && <Ionicons name="swap-horizontal" size={18} color={theme.colors.textMuted} />}
              </Row>
            );
          })}
        </Card>
      ))}

      {editing && !kicked && (
        <Button title={t('teams.regenerate')} icon="shuffle-outline" variant="secondary" onPress={askRegenerate} loading={regenerate.isPending} testID="regenerate-teams" />
      )}

      <SwapSheet picked={picked} teams={teams} onClose={() => setPicked(null)} onSwap={(b) => picked && swap.mutate({ a: picked.user_id, b, record: true })} busy={swap.isPending} />
    </Screen>
  );
}

/** T4: swapping keeps team sizes; each option previews the new averages. */
function SwapSheet({ picked, teams, onClose, onSwap, busy }: { picked: Player | null; teams: TeamView[]; onClose: () => void; onSwap: (userId: string) => void; busy: boolean }) {
  const t = useT();
  if (!picked) return null;
  const from = teams.find((team) => team.players.some((p) => p.user_id === picked.user_id))!;
  return (
    <Sheet visible onClose={onClose} title={t('teams.swapTitle', { name: firstName(picked.name) })} subtitle={t('teams.swapSubtitle')} testID="swap-sheet">
      <View style={[styles.current]}>
        <View style={[styles.dot, { backgroundColor: teamColor(from.index) }]} />
        <Txt variant="bodyStrong" tone="muted">{t('teams.currentTeam', { team: from.name })}</Txt>
      </View>
      {teams
        .filter((team) => team.id !== from.id)
        .map((team) => (
          <View key={team.id} style={{ gap: 6 }}>
            <View style={styles.current}>
              <View style={[styles.dot, { backgroundColor: teamColor(team.index) }]} />
              <Txt variant="label" tone="secondary">{team.name}</Txt>
            </View>
            {team.players.map((other) => {
              const newFrom = average(from.players.map((p) => (p.user_id === picked.user_id ? other : p)));
              const newTo = average(team.players.map((p) => (p.user_id === other.user_id ? picked : p)));
              const gap = gapOf(teams.map((x) => (x.id === from.id ? newFrom : x.id === team.id ? newTo : x.avg)));
              return (
                <Pressable
                  key={other.user_id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => onSwap(other.user_id)}
                  style={styles.option}
                  testID={`swap-${other.user_id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{other.name}{other.rating !== null ? ` · ${other.rating}` : ''}</Txt>
                    {newFrom !== null && newTo !== null && (
                      <Txt variant="caption" tone="secondary">
                        {t('teams.swapPreview', { from: from.name, fromAvg: newFrom.toFixed(1), to: team.name, toAvg: newTo.toFixed(1) })}
                      </Txt>
                    )}
                  </View>
                  <Txt variant="caption" style={{ color: gap <= FAIR_GAP ? theme.colors.success : theme.colors.warning }}>
                    {t('teams.gap', { gap: gap.toFixed(1) })}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        ))}
      <Button title={t('common.cancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  balance: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editBar: { flexDirection: 'row', gap: 10 },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  playerEditable: { paddingHorizontal: 8, borderRadius: theme.borderRadius.s, backgroundColor: theme.colors.surfaceRaised, marginBottom: 4 },
  rating: {
    fontFamily: theme.fonts.heavy, color: theme.colors.text, minWidth: 26, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, backgroundColor: theme.colors.surfaceRaised, overflow: 'hidden',
  },
  current: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border,
  },
});
