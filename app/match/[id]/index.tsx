import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { callFunction, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { isAdminRole, useGroupRole } from '@/lib/groups';
import { formatDate, useLocaleStore, useT } from '@/lib/i18n';
import { confirm, showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { shareToWhatsApp, useInvalidateMatch, useJoinLeave } from '@/lib/matches';
import { Match, MatchSummary, Signup, Team } from '@/lib/types';
import { appUrl, firstName, teamLabel, formatMoney, getMatchStatus, isSignupWindowOpen, relativeTime, teamsPickedAt } from '@/lib/utils';
import { VenueLine } from '@/components/MatchCard';
import { EditMatchSheet, OrganiserSheet, PaymentSheet, SquadPlayer, VoteSheet } from '@/components/match/sheets';
import { Button, Card, ErrorState, IconButton, LoadingState, Screen, ScreenHeader, SectionHeader, StatusChip, Txt } from '@/components/ui';

type SignupRow = Signup & { profile: { display_name: string; avatar_url: string | null } | null };
type TeamRow = Team & { team_assignment: { user_id: string }[] };

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const myId = session?.user.id;
  const invalidate = useInvalidateMatch();
  const { join, leave } = useJoinLeave();
  const [now, setNow] = useState(new Date());
  const [sheet, setSheet] = useState<'organiser' | 'edit' | 'payment' | 'vote' | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const matchQuery = useQuery({
    queryKey: ['match', id, myId],
    queryFn: async () => {
      // Draws teams at T-60 and rolls weekly matches before we read the match.
      await rpc('sync_matches').catch(() => undefined);
      const { data, error } = await supabase.from('match').select('*, club(name)').eq('id', id).single();
      if (error) throw error;
      return { ...data, fee_amount: Number(data.fee_amount) } as Match & { club: { name: string } };
    },
  });
  const match = matchQuery.data;
  const { data: role } = useGroupRole(match?.club_id);
  const isAdmin = isAdminRole(role);

  const signupsQuery = useQuery({
    queryKey: ['signups', id, myId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signup')
        .select('id,match_id,user_id,state,queue_pos,paid,attended,created_at')
        .eq('match_id', id)
        .neq('state', 'cancelled')
        .order('created_at');
      if (error) throw error;
      if (!data.length) return [] as SignupRow[];
      const { data: profiles } = await supabase.from('profile').select('user_id,display_name,avatar_url').in('user_id', data.map((s) => s.user_id));
      return data.map((s) => ({ ...s, profile: profiles?.find((p) => p.user_id === s.user_id) ?? null })) as SignupRow[];
    },
  });

  const locked = match?.status === 'locked' || match?.status === 'completed';
  const teamsQuery = useQuery({
    queryKey: ['teams', id, myId],
    enabled: !!locked,
    queryFn: async () => {
      const { data, error } = await supabase.from('team').select('id,match_id,name,score,team_assignment(user_id)').eq('match_id', id).order('name');
      if (error) throw error;
      return data as TeamRow[];
    },
  });

  const kicked = !!match && new Date(match.kick_off).getTime() <= now.getTime();
  const summaryQuery = useQuery({
    queryKey: ['match-summary', id, myId],
    enabled: kicked && match?.status !== 'cancelled',
    queryFn: () => rpc<MatchSummary>('match_summary', { m: id }),
  });

  // Realtime: someone joins, leaves or is promoted.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`match:${id}:signups`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signup', filter: `match_id=eq.${id}` }, () => {
        void client.invalidateQueries({ queryKey: ['signups', id] });
        void client.invalidateQueries({ queryKey: ['feed'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, client]);

  const lock = useMutation({
    mutationFn: () => callFunction('lock-and-generate', { matchId: id }),
    onSuccess: () => {
      void invalidate();
      showToast(t('match.teamsReady'), { action: { label: t('match.viewTeams'), onPress: () => router.push(`/teams/${id}`) } });
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('match').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['feed'] });
      showToast(t('match.deleted'));
      router.replace('/(tabs)/matches');
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  const signups = useMemo(() => signupsQuery.data ?? [], [signupsQuery.data]);
  const confirmed = useMemo(() => signups.filter((s) => s.state === 'confirmed'), [signups]);
  const waitlist = useMemo(() => signups.filter((s) => s.state === 'waitlist').sort((a, b) => (a.queue_pos ?? 0) - (b.queue_pos ?? 0)), [signups]);
  const players: SquadPlayer[] = confirmed.map((s) => ({
    user_id: s.user_id,
    display_name: s.profile?.display_name ?? '?',
    avatar_url: s.profile?.avatar_url ?? null,
    paid: s.paid,
    attended: s.attended,
  }));

  if (matchQuery.isLoading) return <Screen header={<ScreenHeader back />}><LoadingState /></Screen>;
  if (matchQuery.error || !match) {
    return <Screen header={<ScreenHeader back />}><ErrorState error={matchQuery.error ?? t('match.notFound')} onRetry={() => matchQuery.refetch()} /></Screen>;
  }

  const status = getMatchStatus(match, now);
  const mine = signups.find((s) => s.user_id === myId);
  const mySpot = mine?.state === 'confirmed' ? confirmed.findIndex((s) => s.user_id === myId) + 1 : null;
  const spotsLeft = Math.max(0, match.spots - confirmed.length);
  const full = spotsLeft === 0;
  const canJoin = isSignupWindowOpen(match, now) && !mine;
  const canLeave = !!mine && match.status === 'scheduled' && !kicked;
  const pickedAt = formatDate.time(teamsPickedAt(match.kick_off), locale);
  const perTeam = Math.floor(match.spots / match.teams_count);
  const myTeam = teamsQuery.data?.find((team) => team.team_assignment.some((a) => a.user_id === myId));
  const played = mine?.state === 'confirmed' && mine.attended !== false;
  const votingOpen = kicked && played && match.status !== 'cancelled' && now.getTime() - new Date(match.kick_off).getTime() < 14 * 24 * 60 * 60 * 1000;

  const statusChip = (() => {
    if (status === 'cancelled') return <StatusChip label={t('status.cancelled')} tone="error" />;
    if (status === 'completed') return <StatusChip label={t('status.played')} />;
    if (status === 'started') return <StatusChip label={t('status.inProgress')} tone="warning" />;
    if (status === 'locked') return <StatusChip label={t('status.teamsPicked')} />;
    if (status === 'waiting') return <StatusChip label={t('status.soon')} />;
    return full ? <StatusChip label={t('status.full')} tone="warning" /> : <StatusChip label={t('status.open')} tone="open" />;
  })();

  const shareSquad = () => {
    const lines = [
      `⚽ ${formatDate.day(match.kick_off, locale)} · ${formatDate.time(match.kick_off, locale)}${match.venue_name ? ` · ${match.venue_name}` : ''}`,
      full ? t('share.full', { count: waitlist.length }) : t('share.spotsLeft', { count: spotsLeft }),
      '',
      `${t('match.squad')}: ${players.map((p) => firstName(p.display_name)).join(', ') || '—'}`,
      '',
      appUrl(`/match/${match.id}`),
    ];
    void shareToWhatsApp(lines.join('\n'));
  };

  const askLeave = async () => {
    const ok = await confirm({
      title: t('leave.title'),
      message:
        mine?.state === 'waitlist'
          ? t('leave.waitlistBody', { position: mine.queue_pos ?? '?' })
          : `${t('leave.confirmedBody', { spot: mySpot ?? '?' })} ${t('leave.lockNote', { time: pickedAt })}`,
      cancelLabel: t('leave.keep'),
      confirmLabel: t('leave.confirm'),
      destructive: true,
    });
    if (ok) leave.mutate(match.id, { onSuccess: () => showToast(t('leave.done')) });
  };

  const askLock = async () => {
    const ok = await confirm({
      title: t('organiser.lockTitle'),
      message: t('organiser.lockBody', { teams: match.teams_count, count: confirmed.length }),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('organiser.lockConfirm'),
    });
    if (ok) lock.mutate();
  };

  const askDelete = async () => {
    const ok = await confirm({
      title: t('organiser.deleteTitle'),
      message: t('organiser.deleteBody', { when: `${formatDate.day(match.kick_off, locale)} ${formatDate.time(match.kick_off, locale)}`, count: confirmed.length }),
      cancelLabel: t('organiser.keepMatch'),
      confirmLabel: t('organiser.delete'),
      destructive: true,
    });
    if (ok) remove.mutate();
  };

  const header = (
    <ScreenHeader
      back
      right={
        <>
          {statusChip}
          <IconButton icon="share-outline" accessibilityLabel={t('share.whatsapp')} onPress={shareSquad} testID="share-match" />
          {isAdmin && <IconButton icon="ellipsis-horizontal" accessibilityLabel={t('organiser.title')} onPress={() => setSheet('organiser')} testID="organiser-menu" />}
        </>
      }
    />
  );

  // One state-specific primary action at the bottom; everything else is constant (M14).
  const footer = canJoin ? (
    <Button
      title={full ? t('match.joinWaitlist') : t('match.join')}
      onPress={() => join.mutate({ matchId: match.id, kickOff: match.kick_off })}
      loading={join.isPending}
      testID="join-match-button"
    />
  ) : undefined;

  return (
    <Screen
      header={header}
      footer={footer}
      testID="match-detail"
      refreshControl={<RefreshControl refreshing={matchQuery.isRefetching} onRefresh={() => { void matchQuery.refetch(); void signupsQuery.refetch(); }} tintColor={theme.colors.primary} />}
    >
      {/* M9: date and time on two lines, no dangling separator. */}
      <View>
        <Txt variant="hero" accessibilityRole="header">{formatDate.day(match.kick_off, locale)}</Txt>
        <Txt variant="hero" style={{ color: theme.colors.textSecondary }}>{formatDate.time(match.kick_off, locale)}</Txt>
        <Txt variant="bodyStrong" tone="secondary" style={{ marginTop: 6 }}>
          {match.club.name} · {relativeTime(match.kick_off, now)}{match.repeat_weekly ? ` · ${t('match.weekly')}` : ''}
        </Txt>
        {/* M10: where the match is, with a map link. */}
        <VenueLine name={match.venue_name} url={match.venue_url} />
      </View>

      {/* M11: the same three plain-language tiles in every state. */}
      <View style={styles.tiles}>
        {kicked ? (
          <Tile value={String(confirmed.filter((s) => s.attended !== false).length)} label={t('match.playedLabel', { count: confirmed.filter((s) => s.attended !== false).length })} />
        ) : (
          <Tile value={String(full ? waitlist.length : spotsLeft)} label={full ? t('match.waitlistLabel', { count: waitlist.length }) : t('match.spotsLeftLabel', { count: spotsLeft })} tone={full ? 'warning' : undefined} />
        )}
        <Tile value={`${match.teams_count}×${perTeam}`} label={t('match.teamsOf', { count: match.teams_count, perTeam })} />
        <Tile value={locked ? '✓' : pickedAt} label={locked ? t('match.teamsPickedLabel') : t('match.teamsPickedAtLabel')} />
      </View>

      <MyStatus mine={mine} spot={mySpot} team={myTeam ? teamLabel(myTeam.name) : undefined} t={t} />

      {mine && !canLeave && match.status === 'locked' && !kicked && (
        <Txt variant="caption" tone="secondary">{t('leave.afterLock')}</Txt>
      )}

      {/* M14: Chat and Teams are always here, always labelled. */}
      <View style={styles.pair}>
        <Button title={t('match.chat')} icon="chatbubble-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/match/${match.id}/chat`)} disabled={!role} testID="open-chat" />
        <Button
          title={locked ? t('match.teams') : t('match.teamsAt', { time: pickedAt })}
          icon="shirt-outline"
          variant="secondary"
          style={{ flex: 1 }}
          disabled={!locked}
          onPress={() => router.push(`/teams/${match.id}`)}
          testID="open-teams"
        />
      </View>

      {kicked && match.status !== 'cancelled' && (
        <ResultCard
          teams={teamsQuery.data ?? []}
          summary={summaryQuery.data}
          attended={confirmed.filter((s) => s.attended !== false).length}
          total={confirmed.length}
          recorded={match.status === 'completed'}
          isAdmin={isAdmin}
          canVote={votingOpen}
          onVote={() => setSheet('vote')}
          onRecord={() => router.push(`/match/${match.id}/result`)}
          t={t}
        />
      )}

      {/* M13: the fee answers "each or total?", "have I paid?" and "how?". */}
      {match.fee_amount > 0 && (
        <Card onPress={() => setSheet('payment')} style={styles.feeRow} testID="fee-row">
          <Ionicons name="cash-outline" size={20} color={theme.colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">{t('payment.each', { amount: formatMoney(match.fee_amount, match.fee_currency) })}</Txt>
            <Txt variant="caption" tone={mine?.state === 'confirmed' && !mine.paid ? 'warning' : 'secondary'}>
              {mine?.state === 'confirmed' ? (mine.paid ? t('payment.youPaid') : t('payment.youNotPaid')) : t('payment.paidCount', { paid: players.filter((p) => p.paid).length, total: players.length })}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Card>
      )}

      {/* M12: first names, and empty places that are clearly empty. */}
      <SectionHeader
        title={t('match.squadCount', { count: confirmed.length, spots: match.spots })}
        right={!full && !kicked ? <Txt variant="caption" tone="primary">{t('match.spotsLeft', { count: spotsLeft })}</Txt> : undefined}
      />
      <View style={styles.grid} testID="squad-grid">
        {players.map((p) => {
          const isMe = p.user_id === myId;
          return (
            <View key={p.user_id} style={[styles.slot, isMe && styles.slotMe, p.attended === false && { opacity: 0.45 }]}>
              <Txt variant="caption" numberOfLines={1} style={[styles.slotText, isMe && { color: theme.colors.primaryText }]}>
                {isMe ? t('common.you') : firstName(p.display_name)}
              </Txt>
            </View>
          );
        })}
        {Array.from({ length: spotsLeft }).map((_, i) => (
          <View key={`empty-${i}`} style={[styles.slot, styles.slotEmpty]} accessibilityLabel={t('match.emptySpot')}>
            <Txt variant="caption" tone="muted">{t('match.open')}</Txt>
          </View>
        ))}
      </View>

      {waitlist.length > 0 && (
        <>
          <SectionHeader title={t('match.waitlistCount', { count: waitlist.length })} />
          <Card style={{ paddingVertical: 4 }}>
            {waitlist.map((s) => {
              const isMe = s.user_id === myId;
              return (
                <View key={s.id} style={styles.waitRow}>
                  <Txt variant="number" style={[styles.waitPos, isMe && { color: theme.colors.warning }]}>#{s.queue_pos}</Txt>
                  <Txt variant="bodyStrong" style={[{ flex: 1 }, isMe && { color: theme.colors.warning }]}>
                    {s.profile?.display_name ?? '?'}{isMe ? ` (${t('common.youLower')})` : ''}
                  </Txt>
                  <Txt variant="caption" tone="muted">{formatDate.weekday(s.created_at, locale)} {formatDate.time(s.created_at, locale)}</Txt>
                </View>
              );
            })}
          </Card>
        </>
      )}

      {/* M18: leaving is available but quiet. */}
      {canLeave && (
        <Button
          title={mine?.state === 'waitlist' ? t('leave.leaveWaitlist') : t('leave.leaveMatch')}
          variant="dangerGhost"
          size="m"
          onPress={askLeave}
          loading={leave.isPending}
          testID="leave-match-button"
          style={{ alignSelf: 'center' }}
        />
      )}

      {isAdmin && (
        <>
          <OrganiserSheet
            visible={sheet === 'organiser'}
            onClose={() => setSheet(null)}
            match={match}
            kicked={kicked}
            confirmedCount={confirmed.length}
            onEdit={() => setSheet('edit')}
            onLock={askLock}
            onResult={() => router.push(`/match/${match.id}/result`)}
            onPayments={() => setSheet('payment')}
            onDelete={askDelete}
          />
          <EditMatchSheet visible={sheet === 'edit'} onClose={() => setSheet(null)} match={match} />
        </>
      )}
      <PaymentSheet visible={sheet === 'payment'} onClose={() => setSheet(null)} match={match} players={players} myUserId={myId} isAdmin={isAdmin} />
      <VoteSheet visible={sheet === 'vote'} onClose={() => setSheet(null)} matchId={match.id} players={players} myUserId={myId} myVote={summaryQuery.data?.my_vote ?? null} />
    </Screen>
  );
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'warning' }) {
  return (
    <View style={styles.tile}>
      <Txt variant="number" numberOfLines={1} adjustsFontSizeToFit style={tone === 'warning' ? { color: theme.colors.warning } : undefined}>{value}</Txt>
      <Txt variant="caption" tone="secondary" numberOfLines={2}>{label}</Txt>
    </View>
  );
}

function MyStatus({ mine, spot, team, t }: { mine?: SignupRow; spot: number | null; team?: string; t: ReturnType<typeof useT> }) {
  if (!mine) return null;
  if (mine.state === 'waitlist') {
    return (
      <Card style={styles.waitCard} testID="my-status">
        <Txt variant="hero" style={{ color: theme.colors.warning }}>#{mine.queue_pos}</Txt>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="heading">{t('match.onWaitlist')}</Txt>
          <Txt variant="caption" tone="secondary">{t('match.waitlistExplain')}</Txt>
        </View>
      </Card>
    );
  }
  return (
    <Card style={styles.inCard} testID="my-status">
      <View style={styles.check}>
        <Ionicons name="checkmark" size={22} color={theme.colors.onPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="title">{t('match.youreIn')}</Txt>
        <Txt variant="caption" tone="secondary">
          {team ? t('match.confirmedTeam', { team }) : t('match.confirmedSpot', { spot: spot ?? '?' })}
        </Txt>
      </View>
    </Card>
  );
}

function ResultCard({
  teams,
  summary,
  attended,
  total,
  recorded,
  isAdmin,
  canVote,
  onVote,
  onRecord,
  t,
}: {
  teams: TeamRow[];
  summary?: MatchSummary;
  attended: number;
  total: number;
  recorded: boolean;
  isAdmin: boolean;
  canVote: boolean;
  onVote: () => void;
  onRecord: () => void;
  t: ReturnType<typeof useT>;
}) {
  const scored = teams.filter((team) => team.score !== null);
  const top = Math.max(...scored.map((team) => team.score ?? 0));
  return (
    <Card style={{ gap: 12 }} testID="result-card">
      <Txt variant="label" tone="secondary">{t('result.title')}</Txt>
      {scored.length > 0 ? (
        <View style={styles.scores}>
          {scored.map((team) => (
            <View key={team.id} style={styles.score}>
              <Txt variant="number" style={team.score === top ? { color: theme.colors.text } : { color: theme.colors.textSecondary }}>{team.score}</Txt>
              <Txt variant="caption" tone="secondary">{teamLabel(team.name)}</Txt>
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="body" tone="secondary">{recorded ? t('result.noScore') : t('match.awaitingResult')}</Txt>
      )}
      {recorded && total > 0 && <Txt variant="caption" tone="secondary">{t('result.showedUp', { count: attended, total })}</Txt>}
      {summary && summary.motm.length > 0 && (
        <View style={styles.motm}>
          <Ionicons name="star" size={18} color={theme.colors.warning} />
          <Txt variant="bodyStrong" style={{ flex: 1 }}>{t('motm.winner', { names: summary.motm.map((m) => m.display_name).join(', ') })}</Txt>
          <Txt variant="caption" tone="muted">{t('motm.votes', { count: summary.votes })}</Txt>
        </View>
      )}
      <View style={{ gap: 10 }}>
        {canVote && (
          <Pressable accessibilityRole="button" onPress={onVote} style={styles.voteButton} testID="vote-motm">
            <Ionicons name="star-outline" size={18} color={theme.colors.text} />
            <Txt variant="bodyStrong">{summary?.my_vote ? t('motm.changeVote') : t('motm.vote')}</Txt>
          </Pressable>
        )}
        {isAdmin && (
          <Button title={recorded ? t('organiser.editResult') : t('organiser.recordResult')} variant={recorded ? 'secondary' : 'primary'} size="m" onPress={onRecord} testID="record-result" />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, minHeight: 84, padding: 12, gap: 2, borderRadius: theme.borderRadius.m, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  pair: { flexDirection: 'row', gap: 10 },
  inCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.primary },
  check: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  waitCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: theme.colors.warningTint, borderColor: theme.colors.warning },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: '31.5%', minHeight: 44, borderRadius: theme.borderRadius.s, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border,
  },
  slotMe: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryTint },
  slotEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: theme.colors.borderStrong },
  slotText: { fontFamily: theme.fonts.bold, color: theme.colors.text },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  waitPos: { fontSize: 20, width: 40, color: theme.colors.textSecondary },
  scores: { flexDirection: 'row', gap: 10 },
  score: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: theme.borderRadius.m, backgroundColor: theme.colors.surfaceRaised },
  motm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voteButton: {
    flexDirection: 'row', gap: 8, minHeight: theme.hitTarget, alignItems: 'center', justifyContent: 'center',
    borderRadius: theme.borderRadius.m, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceRaised,
  },
});
