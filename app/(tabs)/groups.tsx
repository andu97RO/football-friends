import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { GROUP_KEYS, groupAction, isAdminRole, useGroups } from '@/lib/groups';
import { useT } from '@/lib/i18n';
import { parseInviteCode } from '@/lib/invite';
import { confirm, showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { Club, MyGroup } from '@/lib/types';
import { initials } from '@/lib/utils';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, LoadingState, ratingLabel, Screen, ScreenHeader, SectionHeader, Sheet, StatusChip, Txt } from '@/components/ui';

function GroupTile({ name }: { name: string }) {
  return (
    <View style={styles.tile}>
      <Txt variant="number" style={{ fontSize: 20 }}>{initials(name)}</Txt>
    </View>
  );
}

function JoinByCodeSheet({ visible, onClose, initialCode = '' }: { visible: boolean; onClose: () => void; initialCode?: string }) {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const [input, setInput] = useState(initialCode);
  useEffect(() => {
    if (visible) setInput(initialCode);
  }, [visible, initialCode]);
  const code = parseInviteCode(input);
  const preview = useQuery({
    queryKey: ['group-by-code', code],
    enabled: visible && code.length >= 6,
    queryFn: async () => (await rpc<{ club_id: string; name: string; description: string; member_count: number; my_status: string | null }[]>('group_by_code', { code }))[0] ?? null,
  });
  const join = useMutation({
    mutationFn: () => groupAction({ action: 'join_code', value: code }),
    onSuccess: async () => {
      await Promise.all(GROUP_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
      onClose();
      showToast(t('groups.joined', { name: preview.data?.name ?? '' }));
      router.push('/(tabs)/matches');
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });
  const already = preview.data?.my_status === 'approved';
  return (
    <Sheet visible={visible} onClose={onClose} title={t('groups.joinWithCode')} subtitle={t('groups.joinWithCodeHelp')} testID="join-code-sheet">
      <Field label={t('groups.inviteCode')} placeholder="AB12CD34" value={input} onChangeText={setInput} autoCapitalize="characters" autoCorrect={false} testID="invite-code-input" />
      {code.length >= 6 && preview.isFetched && (
        preview.data ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <GroupTile name={preview.data.name} />
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{preview.data.name}</Txt>
              <Txt variant="caption" tone="secondary">{t('groups.memberCount', { count: preview.data.member_count })}</Txt>
            </View>
          </Card>
        ) : (
          <Txt variant="body" tone="error">{t('groups.codeNotFound')}</Txt>
        )
      )}
      <Button
        title={already ? t('groups.alreadyMember') : t('groups.joinGroup')}
        onPress={() => join.mutate()}
        disabled={!preview.data || already}
        loading={join.isPending}
        testID="join-code-button"
      />
    </Sheet>
  );
}

/** G3: a rare action, so it lives in a sheet instead of taking a third of the screen. */
function CreateGroupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => groupAction({ action: 'create', value: name.trim(), description: description.trim() }),
    onSuccess: async (id) => {
      await Promise.all(GROUP_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
      setName('');
      setDescription('');
      onClose();
      router.push(`/group/${id}`);
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={t('groups.createGroup')} subtitle={t('groups.createHelp')} testID="create-group-sheet">
      <Field label={t('groups.name')} placeholder={t('groups.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} testID="group-name-input" />
      <Field label={t('groups.description')} placeholder={t('groups.descriptionPlaceholder')} value={description} onChangeText={setDescription} maxLength={500} multiline />
      <Button title={t('groups.createGroup')} onPress={() => create.mutate()} disabled={!name.trim()} loading={create.isPending} testID="create-group-button" />
    </Sheet>
  );
}

export default function GroupsScreen() {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ sheet?: 'join' | 'create'; code?: string }>();
  const groups = useGroups();
  const [sheet, setSheet] = useState<'join' | 'create' | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (params.sheet) {
      setSheet(params.sheet);
      router.setParams({ sheet: undefined });
    }
  }, [params.sheet, router]);

  const term = search.trim().replace(/[%_]/g, '');
  // M8: search only lists groups that chose to be listed; everything else is invite-only.
  const directory = useQuery({
    queryKey: ['group-directory', term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.from('club').select('id,name,description').eq('listed', true).ilike('name', `%${term}%`).order('name').limit(20);
      if (error) throw error;
      return data as Club[];
    },
  });

  const act = useMutation({
    mutationFn: groupAction,
    onSuccess: async (_id, args) => {
      await Promise.all(GROUP_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
      showToast(args.action === 'request' ? t('groups.requestSent') : t('groups.requestCancelled'));
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  const cancelRequest = async (group: MyGroup) => {
    const ok = await confirm({
      title: t('groups.cancelRequestTitle'),
      message: t('groups.cancelRequestBody', { name: group.name }),
      cancelLabel: t('groups.keepRequest'),
      confirmLabel: t('groups.cancelRequest'),
      destructive: true,
    });
    if (ok) act.mutate({ action: 'withdraw', g: group.club_id });
  };

  const header = <ScreenHeader title={t('tabs.groups')} />;
  if (groups.isLoading) return <Screen header={header} tabBar><LoadingState /></Screen>;
  if (groups.error) return <Screen header={header} tabBar><ErrorState error={groups.error} onRetry={() => groups.refetch()} /></Screen>;

  const mine = new Set((groups.data ?? []).map((g) => g.club_id));
  const results = (directory.data ?? []).filter((g) => !mine.has(g.id));

  return (
    <Screen
      header={header}
      tabBar
      testID="groups-screen"
      refreshControl={<RefreshControl refreshing={groups.isRefetching} onRefresh={() => groups.refetch()} tintColor={theme.colors.primary} />}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={t('groups.joinWithCodeShort')} icon="link-outline" onPress={() => setSheet('join')} style={{ flex: 1 }} testID="open-join-code" />
        <Button title={t('groups.createGroup')} icon="add" variant="secondary" onPress={() => setSheet('create')} style={{ flex: 1 }} testID="open-create-group" />
      </View>

      <SectionHeader title={t('groups.yours')} />
      {(groups.data ?? []).length === 0 ? (
        <EmptyState icon="people-outline" title={t('matches.noGroupTitle')} body={t('groups.noneBody')} />
      ) : (
        (groups.data ?? []).map((g) =>
          g.status === 'pending' ? (
            // G2: one word ("Pending"), in one place, with a way to cancel.
            <Card key={g.club_id} style={styles.groupCard} testID={`group-${g.club_id}`}>
              <View style={styles.groupHead}>
                <GroupTile name={g.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="heading">{g.name}</Txt>
                  <Txt variant="caption" tone="secondary">{t('groups.pendingHelp')}</Txt>
                </View>
                <StatusChip label={t('groups.pending')} tone="warning" />
              </View>
              <Button title={t('groups.cancelRequest')} variant="secondary" size="m" onPress={() => cancelRequest(g)} />
            </Card>
          ) : (
            <Card key={g.club_id} onPress={() => router.push(`/group/${g.club_id}`)} style={styles.groupCard} testID={`group-${g.club_id}`}>
              <View style={styles.groupHead}>
                <GroupTile name={g.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="heading">{g.name}</Txt>
                  <Txt variant="caption" tone="secondary">
                    {t(`role.${g.role}`)} · {t('groups.memberCount', { count: g.member_count })} · {t('groups.yourRating', { rating: ratingLabel(g.rating) })}
                  </Txt>
                </View>
                {isAdminRole(g.role) && g.pending_requests > 0 && (
                  <View style={styles.requests} accessibilityLabel={t('groups.requestsCount', { count: g.pending_requests })}>
                    <Txt variant="caption" style={styles.requestsText}>{g.pending_requests}</Txt>
                  </View>
                )}
                <IconButton icon="chevron-forward" variant="plain" accessibilityLabel={isAdminRole(g.role) ? t('groups.manage') : t('groups.open')} onPress={() => router.push(`/group/${g.club_id}`)} />
              </View>
            </Card>
          )
        )
      )}

      <SectionHeader title={t('groups.find')} />
      <Field placeholder={t('groups.searchPlaceholder')} value={search} onChangeText={setSearch} icon="search" accessibilityLabel={t('groups.find')} testID="group-search" />
      <Txt variant="caption" tone="muted">{t('groups.searchHelp')}</Txt>
      {directory.error && <Txt variant="body" tone="error">{(directory.error as Error).message}</Txt>}
      {term.length >= 2 && directory.isFetched && results.length === 0 && <Txt variant="body" tone="secondary">{t('groups.noResults')}</Txt>}
      {results.map((g) => (
        <Card key={g.id} style={styles.groupHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading">{g.name}</Txt>
            {!!g.description && <Txt variant="caption" tone="secondary">{g.description}</Txt>}
          </View>
          <Button title={t('groups.askToJoin')} size="m" variant="secondary" onPress={() => act.mutate({ action: 'request', g: g.id })} loading={act.isPending && act.variables?.g === g.id} />
        </Card>
      ))}

      <JoinByCodeSheet visible={sheet === 'join'} onClose={() => setSheet(null)} initialCode={params.code ?? ''} />
      <CreateGroupSheet visible={sheet === 'create'} onClose={() => setSheet(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  groupCard: { gap: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requests: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: theme.colors.warning, alignItems: 'center', justifyContent: 'center' },
  requestsText: { fontFamily: theme.fonts.heavy, color: theme.colors.onPrimary },
});
