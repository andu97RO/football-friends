import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { useInvalidateMatch } from '@/lib/matches';
import { Match } from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import { MatchForm, matchFormError, matchFormToRow, MatchFormValue } from '@/components/MatchForm';
import { Avatar, Button, ListGroup, ListRow, Sheet, Txt } from '@/components/ui';

export type SquadPlayer = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  paid: boolean;
  attended: boolean | null;
};

/** M16 M21: organiser tools live behind "…" so the squad stays at the top. */
export function OrganiserSheet({
  visible,
  onClose,
  match,
  kicked,
  confirmedCount,
  onEdit,
  onLock,
  onResult,
  onPayments,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  match: Match;
  kicked: boolean;
  confirmedCount: number;
  onEdit: () => void;
  onLock: () => void;
  onResult: () => void;
  onPayments: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('organiser.title')} testID="organiser-sheet">
      <ListGroup>
        {!kicked && match.status !== 'completed' && <ListRow icon="create-outline" title={t('organiser.edit')} onPress={run(onEdit)} testID="organiser-edit" />}
        {match.status === 'scheduled' && !kicked && confirmedCount >= 2 && (
          <ListRow kind="action" icon="lock-closed-outline" title={t('organiser.lockNow')} subtitle={t('organiser.lockNowHelp')} onPress={run(onLock)} testID="organiser-lock" />
        )}
        {kicked && match.status !== 'cancelled' && (
          <ListRow icon="trophy-outline" title={match.status === 'completed' ? t('organiser.editResult') : t('organiser.recordResult')} onPress={run(onResult)} testID="organiser-result" />
        )}
        {match.fee_amount > 0 && <ListRow icon="cash-outline" title={t('organiser.payments')} onPress={run(onPayments)} />}
        <ListRow kind="action" icon="trash-outline" tone="danger" title={t('organiser.delete')} onPress={run(onDelete)} testID="organiser-delete" />
      </ListGroup>
    </Sheet>
  );
}

function formFromMatch(match: Match): MatchFormValue {
  return {
    kickOff: new Date(match.kick_off),
    signupOpen: new Date(match.signup_open_at),
    venueName: match.venue_name,
    venueUrl: match.venue_url,
    fee: match.fee_amount ? String(match.fee_amount) : '',
    currency: match.fee_currency,
    paymentNote: match.payment_note,
    spots: match.spots,
    teams: match.teams_count,
    repeatWeekly: match.repeat_weekly,
  };
}

/** M20: spots, format, venue and fee are all editable, with the same fields as New match. */
export function EditMatchSheet(props: { visible: boolean; onClose: () => void; match: Match }) {
  return props.visible ? <OpenEditMatchSheet {...props} /> : null;
}

// Mounted per opening, so the form starts from the match once and background refetches never overwrite edits.
function OpenEditMatchSheet({ visible, onClose, match }: { visible: boolean; onClose: () => void; match: Match }) {
  const t = useT();
  const invalidate = useInvalidateMatch();
  const [form, setForm] = useState(() => formFromMatch(match));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('match').update(matchFormToRow(form)).eq('id', match.id);
      if (error) throw new Error(/Capacity is below/.test(error.message) ? t('editMatch.errorCapacity') : error.message);
    },
    onSuccess: () => {
      void invalidate();
      onClose();
      showToast(t('editMatch.saved'));
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });
  const error = matchFormError(form, t, false);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('editMatch.title')}
      testID="edit-match-sheet"
      footer={
        <>
          {error && <Txt variant="caption" tone="warning">{error}</Txt>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={t('common.cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.saveChanges')} onPress={() => save.mutate()} loading={save.isPending} disabled={!!error} style={{ flex: 2 }} testID="save-match" />
          </View>
        </>
      }
    >
      <MatchForm value={form} onChange={setForm} />
    </Sheet>
  );
}

/** M13: what the fee is, how to pay, and (for organisers) who has paid. */
export function PaymentSheet({
  visible,
  onClose,
  match,
  players,
  myUserId,
  isAdmin,
}: {
  visible: boolean;
  onClose: () => void;
  match: Match;
  players: SquadPlayer[];
  myUserId?: string;
  isAdmin: boolean;
}) {
  const t = useT();
  const invalidate = useInvalidateMatch();
  const toggle = useMutation({
    mutationFn: ({ player, paid }: { player: string; paid: boolean }) => rpc('set_paid', { m: match.id, player, is_paid: paid }),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });
  const me = players.find((p) => p.user_id === myUserId);
  const paidCount = players.filter((p) => p.paid).length;
  return (
    <Sheet visible={visible} onClose={onClose} title={t('payment.title')} subtitle={t('payment.each', { amount: formatMoney(match.fee_amount, match.fee_currency) })}>
      {me && (
        <View style={styles.meRow}>
          <Ionicons name={me.paid ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={me.paid ? theme.colors.success : theme.colors.warning} />
          <Txt variant="bodyStrong">{me.paid ? t('payment.youPaid') : t('payment.youNotPaid')}</Txt>
        </View>
      )}
      <View style={{ gap: 6 }}>
        <Txt variant="label" tone="secondary">{t('payment.howToPay')}</Txt>
        <Txt variant="body">{match.payment_note || t('payment.noNote')}</Txt>
      </View>
      <Txt variant="caption" tone="muted">{t('payment.whoMarks')}</Txt>
      {isAdmin && (
        <View style={{ gap: 8 }}>
          <Txt variant="label" tone="secondary">{t('payment.paidCount', { paid: paidCount, total: players.length })}</Txt>
          <ListGroup>
            {players.map((p) => (
              <ListRow
                key={p.user_id}
                kind="toggle"
                title={p.display_name}
                toggled={p.paid}
                disabled={toggle.isPending}
                onToggle={(paid) => toggle.mutate({ player: p.user_id, paid })}
              />
            ))}
          </ListGroup>
        </View>
      )}
    </Sheet>
  );
}

/** M6: players who were there pick one teammate as Man of the Match. */
export function VoteSheet({
  visible,
  onClose,
  matchId,
  players,
  myUserId,
  myVote,
}: {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  players: SquadPlayer[];
  myUserId?: string;
  myVote: string | null;
}) {
  const t = useT();
  const invalidate = useInvalidateMatch();
  const vote = useMutation({
    mutationFn: (target: string) => rpc('vote_motm', { m: matchId, target }),
    onSuccess: () => {
      void invalidate();
      onClose();
      showToast(t('motm.thanks'));
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={t('motm.voteTitle')} subtitle={t('motm.voteSubtitle')} testID="vote-sheet">
      <ListGroup>
        {players
          .filter((p) => p.user_id !== myUserId && p.attended !== false)
          .map((p) => (
            <Pressable
              key={p.user_id}
              accessibilityRole="radio"
              accessibilityState={{ checked: myVote === p.user_id }}
              onPress={() => vote.mutate(p.user_id)}
              disabled={vote.isPending}
              style={styles.voteRow}
            >
              <Avatar name={p.display_name} url={p.avatar_url} seed={p.user_id} size={32} />
              <Txt variant="bodyStrong" style={{ flex: 1 }}>{p.display_name}</Txt>
              <Ionicons name={myVote === p.user_id ? 'radio-button-on' : 'radio-button-off'} size={22} color={myVote === p.user_id ? theme.colors.primaryText : theme.colors.textMuted} />
            </Pressable>
          ))}
      </ListGroup>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: theme.borderRadius.m, backgroundColor: theme.colors.surfaceRaised },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: theme.spacing.m },
});
