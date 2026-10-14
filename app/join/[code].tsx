import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { GROUP_KEYS, groupAction } from '@/lib/groups';
import { useT } from '@/lib/i18n';
import { parseInviteCode, usePendingInvite } from '@/lib/invite';
import { showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { AuthShell } from '@/components/AuthShell';
import { Button, Card, LoadingState, Txt } from '@/components/ui';

/** M8: footyfriends.app/join/CODE (or footy://join/CODE) joins the group without search or approval. */
export default function JoinScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = parseInviteCode(params.code ?? '');
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const setPending = usePendingInvite((s) => s.set);
  const authed = isVerifiedSession(session);

  // Remember the invite across sign-up and email confirmation.
  useEffect(() => {
    if (session === null) setPending(code);
  }, [session, code, setPending]);

  const preview = useQuery({
    queryKey: ['group-by-code', code],
    enabled: authed && !!code,
    queryFn: async () => (await rpc<{ club_id: string; name: string; description: string; member_count: number; my_status: string | null }[]>('group_by_code', { code }))[0] ?? null,
  });

  const join = useMutation({
    mutationFn: () => groupAction({ action: 'join_code', value: code }),
    onSuccess: async () => {
      setPending(null);
      await Promise.all(GROUP_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
      showToast(t('groups.joined', { name: preview.data?.name ?? '' }));
      router.replace('/(tabs)/matches');
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  if (session === undefined) return <LoadingState />;
  if (!authed) return <Redirect href="/(auth)/login" />;
  if (preview.isLoading) return <LoadingState />;

  const leave = () => {
    setPending(null);
    router.replace('/(tabs)/matches');
  };

  if (!preview.data) {
    return (
      <AuthShell back={false} icon="link-outline" title={t('join.invalidTitle')} subtitle={t('join.invalidBody')}>
        <Button title={t('join.goToMatches')} onPress={leave} />
      </AuthShell>
    );
  }

  const already = preview.data.my_status === 'approved';
  return (
    <AuthShell back={false} icon="people-outline" title={t('join.title')} subtitle={t('join.subtitle')} testID="join-screen">
      <Card style={{ gap: 6 }}>
        <Txt variant="title">{preview.data.name}</Txt>
        {!!preview.data.description && <Txt variant="body" tone="secondary">{preview.data.description}</Txt>}
        <Txt variant="caption" tone="muted">{t('groups.memberCount', { count: preview.data.member_count })}</Txt>
      </Card>
      <View style={{ gap: 10 }}>
        {already ? (
          <Button title={t('join.goToMatches')} onPress={leave} />
        ) : (
          <Button title={t('join.joinNamed', { name: preview.data.name })} onPress={() => join.mutate()} loading={join.isPending} testID="accept-invite" />
        )}
        {!already && <Button title={t('join.notNow')} variant="ghost" onPress={leave} />}
      </View>
    </AuthShell>
  );
}
