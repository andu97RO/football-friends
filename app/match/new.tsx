import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { callFunction, useFeed } from '@/lib/api';
import { useGroups } from '@/lib/groups';
import { formatDate, useT } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import { showAlert } from '@/lib/alert';
import { MatchForm, matchFormError, matchFormToRow, MatchFormValue } from '@/components/MatchForm';
import { Button, ChoiceChip, LoadingState, Screen, ScreenHeader, Txt } from '@/components/ui';

function nextWeekAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function defaults(): MatchFormValue {
  const kickOff = nextWeekAt(20, 0);
  const signupOpen = new Date(kickOff.getTime() - 3 * 24 * 60 * 60 * 1000);
  signupOpen.setHours(10, 0, 0, 0);
  return { kickOff, signupOpen, venueName: '', venueUrl: '', fee: '', currency: 'RON', paymentNote: '', spots: 18, teams: 3, repeatWeekly: true };
}

/**
 * D1: creating a match lives with the matches ("+" on Matches), not in a separate Admin tab.
 * D2: called "New match". D3/D4: venue, fee, repeat and format are set here.
 */
export default function NewMatchScreen() {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const params = useLocalSearchParams<{ group?: string }>();
  const groups = useGroups();
  const feed = useFeed();
  const [groupId, setGroupId] = useState<string | undefined>(params.group);
  const [form, setForm] = useState<MatchFormValue>(defaults);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  const selected = groups.adminOf.find((g) => g.club_id === groupId) ?? groups.adminOf[0];

  // "Schedule the next game": copy the group's latest match one week on.
  const latest = useMemo(
    () => (feed.data ?? []).filter((m) => m.club_id === selected?.club_id).sort((a, b) => b.kick_off.localeCompare(a.kick_off))[0],
    [feed.data, selected?.club_id]
  );
  useEffect(() => {
    if (!selected || prefilledFor === selected.club_id || feed.isLoading) return;
    setPrefilledFor(selected.club_id);
    if (!latest) return;
    const week = 7 * 24 * 60 * 60 * 1000;
    let kick = new Date(latest.kick_off).getTime();
    let open = new Date(latest.signup_open_at).getTime();
    while (kick <= Date.now()) {
      kick += week;
      open += week;
    }
    setForm({
      kickOff: new Date(kick),
      signupOpen: new Date(open),
      venueName: latest.venue_name,
      venueUrl: latest.venue_url,
      fee: latest.fee_amount ? String(latest.fee_amount) : '',
      currency: latest.fee_currency,
      paymentNote: '',
      spots: latest.spots,
      teams: latest.teams_count,
      repeatWeekly: false,
    });
  }, [selected, latest, prefilledFor, feed.isLoading]);

  const create = useMutation({
    mutationFn: () => callFunction<{ id: string; notified: number }>('create-match', { clubId: selected!.club_id, ...matchFormToRow(form) }),
    onSuccess: async ({ id }) => {
      await client.invalidateQueries({ queryKey: ['feed'] });
      // D6: one sentence with the date, sign-up time and who is notified; land on the new match.
      showToast(
        t('newMatch.created', {
          when: `${formatDate.weekdayDate(form.kickOff)} ${formatDate.time(form.kickOff)}`,
          opens: `${formatDate.weekdayDate(form.signupOpen)} ${formatDate.time(form.signupOpen)}`,
          group: selected!.name,
        }),
        { duration: 7000 }
      );
      router.replace(`/match/${id}`);
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  if (session === undefined || groups.isLoading) return <LoadingState />;
  if (!isVerifiedSession(session)) return <Redirect href="/(auth)/login" />;
  if (!selected) return <Redirect href="/(tabs)/matches" />;

  const error = matchFormError(form, t, true);

  return (
    <Screen
      header={<ScreenHeader back title={t('newMatch.title')} subtitle={t('newMatch.subtitle', { group: selected.name })} />}
      footer={
        <>
          {error && <Txt variant="caption" tone="warning" accessibilityRole="alert">{error}</Txt>}
          <Button title={t('newMatch.create')} onPress={() => create.mutate()} loading={create.isPending} disabled={!!error} testID="create-match-button" />
        </>
      }
      testID="new-match-screen"
    >
      {groups.adminOf.length > 1 && (
        <View style={{ gap: 8 }}>
          <Txt variant="label" tone="secondary">{t('newMatch.group')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {groups.adminOf.map((g) => (
              <ChoiceChip key={g.club_id} label={g.name} selected={g.club_id === selected.club_id} onPress={() => setGroupId(g.club_id)} />
            ))}
          </View>
        </View>
      )}
      <MatchForm value={form} onChange={setForm} />
    </Screen>
  );
}
