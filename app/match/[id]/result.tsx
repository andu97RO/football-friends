import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { isAdminRole, useGroupRole } from '@/lib/groups';
import { formatDate, useLocaleStore, useT } from '@/lib/i18n';
import { showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { useInvalidateMatch } from '@/lib/matches';
import { teamColor } from '@/constants/theme';
import { teamLabel } from '@/lib/utils';
import { Button, EmptyState, ErrorState, ListGroup, ListRow, LoadingState, Screen, ScreenHeader, SectionHeader, Stepper, Txt } from '@/components/ui';

/** M6: after the match an organiser records the score and who showed up. */
export default function RecordResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const router = useRouter();
  const myId = useAuthStore((s) => s.session?.user.id);
  const invalidate = useInvalidateMatch();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [absent, setAbsent] = useState<Set<string>>(new Set());

  const data = useQuery({
    queryKey: ['result-form', id, myId],
    queryFn: async () => {
      const [{ data: match, error }, { data: teams }, { data: signups }] = await Promise.all([
        supabase.from('match').select('id,club_id,kick_off,status').eq('id', id).single(),
        supabase.from('team').select('id,name,score,team_assignment(user_id)').eq('match_id', id).order('name'),
        supabase.from('signup').select('user_id,attended').eq('match_id', id).eq('state', 'confirmed').order('created_at'),
      ]);
      if (error) throw error;
      const ids = (signups ?? []).map((s) => s.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from('profile').select('user_id,display_name').in('user_id', ids)
        : { data: [] as { user_id: string; display_name: string }[] };
      return {
        match,
        teams: (teams ?? []) as { id: string; name: string; score: number | null; team_assignment: { user_id: string }[] }[],
        players: (signups ?? []).map((s) => ({ ...s, name: profiles?.find((p) => p.user_id === s.user_id)?.display_name ?? '?' })),
      };
    },
  });
  const { data: role, isLoading: roleLoading } = useGroupRole(data.data?.match.club_id);

  useEffect(() => {
    if (!data.data) return;
    setScores(Object.fromEntries(data.data.teams.map((team) => [team.id, team.score ?? 0])));
    setAbsent(new Set(data.data.players.filter((p) => p.attended === false).map((p) => p.user_id)));
  }, [data.data]);

  const save = useMutation({
    mutationFn: () => rpc('record_result', { m: id, scores, absent: [...absent] }),
    onSuccess: () => {
      void invalidate();
      showToast(t('result.saved'));
      router.back();
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  if (data.isLoading || roleLoading) return <Screen header={<ScreenHeader back />}><LoadingState /></Screen>;
  if (data.error || !data.data) return <Screen header={<ScreenHeader back />}><ErrorState error={data.error} onRetry={() => data.refetch()} /></Screen>;
  if (!isAdminRole(role)) {
    return <Screen header={<ScreenHeader back />}><EmptyState icon="lock-closed-outline" title={t('common.adminsOnly')} body={t('result.adminsOnlyBody')} /></Screen>;
  }

  const { match, teams, players } = data.data;
  if (new Date(match.kick_off).getTime() > Date.now()) {
    return <Screen header={<ScreenHeader back />}><EmptyState icon="time-outline" title={t('result.notYet')} body={t('result.notYetBody')} /></Screen>;
  }

  return (
    <Screen
      header={<ScreenHeader back title={t('result.title')} subtitle={`${formatDate.day(match.kick_off, locale)} · ${formatDate.time(match.kick_off, locale)}`} titleVariant="title" />}
      footer={<Button title={t('result.save')} onPress={() => save.mutate()} loading={save.isPending} testID="save-result" />}
      testID="record-result-screen"
    >
      {teams.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title={t('result.score')} style={{ marginTop: 0 }} />
          {teams.map((team, i) => (
            <View key={team.id} style={{ gap: 4 }}>
              <Stepper
                label={teamLabel(team.name)}
                value={scores[team.id] ?? 0}
                onChange={(v) => setScores((s) => ({ ...s, [team.id]: v }))}
                min={0}
                max={99}
              />
              <View style={{ height: 3, borderRadius: 2, backgroundColor: teamColor(i), marginHorizontal: 12 }} />
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="body" tone="secondary">{t('result.noTeams')}</Txt>
      )}

      <SectionHeader title={t('result.attendance', { count: players.length - absent.size, total: players.length })} />
      <Txt variant="caption" tone="secondary">{t('result.attendanceHelp')}</Txt>
      <ListGroup>
        {players.map((p) => (
          <ListRow
            key={p.user_id}
            kind="toggle"
            title={p.name}
            toggled={!absent.has(p.user_id)}
            onToggle={(present) =>
              setAbsent((current) => {
                const next = new Set(current);
                if (present) next.delete(p.user_id);
                else next.add(p.user_id);
                return next;
              })
            }
          />
        ))}
      </ListGroup>
    </Screen>
  );
}
