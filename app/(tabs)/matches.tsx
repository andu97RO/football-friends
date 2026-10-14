import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useFeed } from '@/lib/api';
import { useGroups } from '@/lib/groups';
import { useT } from '@/lib/i18n';
import { useJoinLeave } from '@/lib/matches';
import { FeedMatch } from '@/lib/types';
import { getMatchStatus } from '@/lib/utils';
import { MatchRow, OpenMatchCard } from '@/components/MatchCard';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, Screen, ScreenHeader, SectionHeader } from '@/components/ui';

type Section = { key: string; title: string; data: FeedMatch[] };

export default function MatchesScreen() {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const groups = useGroups();
  const feed = useFeed();
  const { join } = useJoinLeave();
  const [now, setNow] = useState(new Date());

  // M4: nothing on this screen counts seconds; a 30 s tick keeps "in 3 h 12 min" honest.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const upcomingIds = useMemo(
    () => (feed.data ?? []).filter((m) => new Date(m.kick_off) > now).map((m) => m.id),
    [feed.data, now]
  );
  const idsKey = upcomingIds.join(',');

  // Realtime: spots and waitlists change while the list is open.
  useEffect(() => {
    if (!idsKey) return;
    const channel = supabase
      .channel(`feed:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signup', filter: `match_id=in.(${idsKey})` }, () => {
        void client.invalidateQueries({ queryKey: ['feed'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [idsKey, userId, client]);

  const adminGroupIds = new Set(groups.adminOf.map((g) => g.club_id));

  // M2: the sections already sort the list, so there are no filter chips or hints.
  const sections = useMemo<Section[]>(() => {
    const open: FeedMatch[] = [];
    const soon: FeedMatch[] = [];
    const picked: FeedMatch[] = [];
    const past: FeedMatch[] = [];
    for (const match of feed.data ?? []) {
      const status = getMatchStatus(match, now);
      if (status === 'open') open.push(match);
      else if (status === 'waiting') soon.push(match);
      else if (status === 'locked') picked.push(match);
      else past.push(match);
    }
    return [
      { key: 'open', title: t('matches.openNow'), data: open },
      { key: 'picked', title: t('matches.teamsPicked'), data: picked },
      { key: 'soon', title: t('matches.openingSoon'), data: soon },
      { key: 'past', title: t('matches.past'), data: past.reverse().slice(0, 12) },
    ].filter((s) => s.data.length > 0);
  }, [feed.data, now, t]);

  const header = (
    <ScreenHeader
      title={t('tabs.matches')}
      right={
        groups.adminOf.length > 0 ? (
          <IconButton icon="add" variant="surface" accessibilityLabel={t('newMatch.title')} testID="new-match-button" onPress={() => router.push('/match/new')} />
        ) : undefined
      }
    />
  );

  if (groups.isLoading || (feed.isLoading && groups.approved.length > 0)) {
    return <Screen header={header} tabBar><LoadingState /></Screen>;
  }
  if (groups.error || feed.error) {
    return (
      <Screen header={header} tabBar>
        <ErrorState error={groups.error ?? feed.error} onRetry={() => { void groups.refetch(); void feed.refetch(); }} />
      </Screen>
    );
  }

  if (groups.approved.length === 0) {
    return (
      <Screen header={header} tabBar testID="matches-no-group">
        <EmptyState
          icon="people-outline"
          title={t('matches.noGroupTitle')}
          body={groups.pending.length ? t('matches.noGroupPending', { name: groups.pending[0].name }) : t('matches.noGroupBody')}
        >
          {/* M8: invited players skip search and approval. */}
          <Button title={t('groups.joinWithCode')} icon="link-outline" onPress={() => router.push({ pathname: '/(tabs)/groups', params: { sheet: 'join' } })} testID="empty-join-code" />
          <Button title={t('groups.createGroup')} variant="secondary" onPress={() => router.push({ pathname: '/(tabs)/groups', params: { sheet: 'create' } })} />
        </EmptyState>
      </Screen>
    );
  }

  const firstJoinable = sections.find((s) => s.key === 'open')?.data.find((m) => !m.my_state && m.confirmed_count < m.spots)?.id;

  return (
    <Screen
      header={header}
      tabBar
      testID="matches-screen"
      refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} tintColor={theme.colors.primary} />}
    >
      {sections.length === 0 ? (
        <EmptyState icon="football-outline" title={t('matches.emptyTitle')} body={groups.adminOf.length ? t('matches.emptyAdmin') : t('matches.emptyBody')}>
          {groups.adminOf.length > 0 && <Button title={t('newMatch.title')} icon="add" onPress={() => router.push('/match/new')} />}
        </EmptyState>
      ) : (
        sections.map((section) => (
          <View key={section.key} style={{ gap: 10 }}>
            <SectionHeader title={section.title} style={{ marginTop: theme.spacing.s, marginBottom: 0 }} />
            {section.data.map((match) =>
              section.key === 'open' ? (
                <OpenMatchCard
                  key={match.id}
                  match={match}
                  now={now}
                  primary={match.id === firstJoinable}
                  onOpen={() => router.push(`/match/${match.id}`)}
                  onJoin={() => join.mutate({ matchId: match.id, kickOff: match.kick_off })}
                  joining={join.isPending && join.variables?.matchId === match.id}
                />
              ) : (
                <MatchRow key={match.id} match={match} now={now} isAdmin={adminGroupIds.has(match.club_id)} onOpen={() => router.push(`/match/${match.id}`)} />
              )
            )}
          </View>
        ))
      )}
    </Screen>
  );
}
