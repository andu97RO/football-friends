import { View } from 'react-native';
import { useT } from '@/lib/i18n';
import { SOFT_LOCK_MS } from '@/lib/utils';
import DateTimeRow from '@/components/DateTimePicker';
import { Field, ListGroup, ListRow, Stepper, Txt } from '@/components/ui';

export type MatchFormValue = {
  kickOff: Date;
  signupOpen: Date;
  venueName: string;
  venueUrl: string;
  fee: string;
  currency: string;
  paymentNote: string;
  spots: number;
  teams: number;
  repeatWeekly: boolean;
};

export function matchFormError(value: MatchFormValue, t: (key: string, params?: any) => string, isNew: boolean): string | null {
  if (isNew && value.kickOff.getTime() <= Date.now()) return t('newMatch.errorPast');
  if (value.signupOpen.getTime() >= value.kickOff.getTime() - SOFT_LOCK_MS) return t('newMatch.errorSignupAfterKickoff');
  if (value.teams > value.spots) return t('newMatch.errorTeams');
  const fee = Number(value.fee.replace(',', '.') || '0');
  if (!Number.isFinite(fee) || fee < 0 || fee > 10000) return t('newMatch.errorFee');
  return null;
}

export function matchFormToRow(value: MatchFormValue) {
  return {
    kick_off: value.kickOff.toISOString(),
    signup_open_at: value.signupOpen.toISOString(),
    venue_name: value.venueName.trim(),
    venue_url: value.venueUrl.trim(),
    fee_amount: Number(value.fee.replace(',', '.') || '0'),
    fee_currency: value.currency,
    payment_note: value.paymentNote.trim(),
    spots: value.spots,
    teams_count: value.teams,
    repeat_weekly: value.repeatWeekly,
  };
}

/**
 * D2 D3 D4 M20: one form for creating and editing a match. Date rows share a
 * single component; spots, format, venue and fee are editable fields.
 */
export function MatchForm({ value, onChange }: { value: MatchFormValue; onChange: (value: MatchFormValue) => void }) {
  const t = useT();
  const set = <K extends keyof MatchFormValue>(key: K, v: MatchFormValue[K]) => onChange({ ...value, [key]: v });
  const perTeam = Math.floor(value.spots / Math.max(1, value.teams));

  // Moving the kick-off moves the sign-up opening with it, keeping the same lead time.
  const setKickOff = (next: Date) => {
    const delta = next.getTime() - value.kickOff.getTime();
    onChange({ ...value, kickOff: next, signupOpen: new Date(value.signupOpen.getTime() + delta) });
  };

  return (
    <View style={{ gap: 16 }}>
      <DateTimeRow label={t('newMatch.kickOff')} value={value.kickOff} onChange={setKickOff} minimumDate={new Date()} testID="kickoff-row" />
      <DateTimeRow label={t('newMatch.signupsOpen')} value={value.signupOpen} onChange={(d) => set('signupOpen', d)} icon="notifications-outline" testID="signup-row" />

      <Field label={t('newMatch.venue')} placeholder={t('newMatch.venuePlaceholder')} value={value.venueName} onChangeText={(v) => set('venueName', v)} maxLength={120} icon="location-outline" testID="venue-input" />
      <Field
        label={t('newMatch.mapLink')}
        helper={t('newMatch.mapLinkHelp')}
        placeholder="https://maps.google.com/…"
        value={value.venueUrl}
        onChangeText={(v) => set('venueUrl', v)}
        autoCapitalize="none"
        keyboardType="url"
        maxLength={500}
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('newMatch.fee')}
            placeholder="0"
            value={value.fee}
            onChangeText={(v) => set('fee', v.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
            icon="cash-outline"
            testID="fee-input"
          />
        </View>
        <View style={{ width: 96 }}>
          <Field label={t('newMatch.currency')} value={value.currency} onChangeText={(v) => set('currency', v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} autoCapitalize="characters" maxLength={3} />
        </View>
      </View>
      <Field
        label={t('newMatch.howToPay')}
        placeholder={t('newMatch.howToPayPlaceholder')}
        value={value.paymentNote}
        onChangeText={(v) => set('paymentNote', v)}
        maxLength={300}
        multiline
      />

      <View style={{ gap: 8 }}>
        <Txt variant="label" tone="secondary">{t('newMatch.format')}</Txt>
        <Stepper label={t('newMatch.spots')} value={value.spots} onChange={(v) => set('spots', v)} min={2} max={40} />
        <Stepper label={t('newMatch.teams')} value={value.teams} onChange={(v) => set('teams', v)} min={2} max={6} />
        <Txt variant="caption" tone="secondary">{t('newMatch.formatSummary', { teams: value.teams, perTeam })}</Txt>
      </View>

      <ListGroup>
        <ListRow
          kind="toggle"
          icon="repeat-outline"
          title={t('newMatch.repeatWeekly')}
          subtitle={t('newMatch.repeatWeeklyHelp')}
          toggled={value.repeatWeekly}
          onToggle={(v) => set('repeatWeekly', v)}
          testID="repeat-weekly"
        />
      </ListGroup>
    </View>
  );
}
