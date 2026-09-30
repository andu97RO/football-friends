import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { formatDate, useLocaleStore, useT } from '@/lib/i18n';
import { FeedMatch } from '@/lib/types';
import { isSignupWindowOpen, relativeTime, teamLabel, teamsPickedAt, venueLink } from '@/lib/utils';
import { Avatar, Button, Card, StatusChip, Txt } from '@/components/ui';

const MAX_AVATARS = 4;

export function VenueLine({ name, url, compact }: { name: string; url: string; compact?: boolean }) {
  const t = useT();
  const link = venueLink(name, url);
  if (!name.trim() && !link) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('match.openMap', { venue: name })}
      disabled={!link}
      onPress={() => link && Linking.openURL(link)}
      style={[styles.venue, !compact && { minHeight: theme.hitTarget }]}
      hitSlop={compact ? 8 : 0}
    >
      <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
      <Txt variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{name || t('match.mapLink')}</Txt>
      {link && !compact && <Ionicons name="open-outline" size={14} color={theme.colors.textMuted} />}
    </Pressable>
  );
}

/** M3: four avatars and a counter on their own row, never overlapping the numbers. */
function SquadPreview({ match }: { match: FeedMatch }) {
  const t = useT();
  const extra = match.confirmed_count - Math.min(match.squad.length, MAX_AVATARS);
  if (match.confirmed_count === 0) return <Txt variant="caption" tone="muted">{t('match.beFirst')}</Txt>;
  return (
    <View style={styles.squad}>
      <View style={styles.avatars}>
        {match.squad.slice(0, MAX_AVATARS).map((p, i) => (
          <View key={p.user_id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
            <Avatar name={p.display_name} url={p.avatar_url} seed={p.user_id} size={30} ring />
          </View>
        ))}
        {extra > 0 && (
          <View style={styles.more}>
            <Txt variant="caption" style={{ fontFamily: theme.fonts.bold }}>+{extra}</Txt>
          </View>
        )}
      </View>
      <Txt variant="caption" tone="secondary">{t('match.inOfSpots', { count: match.confirmed_count, spots: match.spots })}</Txt>
    </View>
  );
}

/** The featured card for a match whose sign-ups are open. */
export function OpenMatchCard({
  match,
  now,
  onOpen,
  onJoin,
  joining,
  primary,
}: {
  match: FeedMatch;
  now: Date;
  onOpen: () => void;
  onJoin: () => void;
  joining: boolean;
  primary: boolean;
}) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const spotsLeft = Math.max(0, match.spots - match.confirmed_count);
  const full = spotsLeft === 0;
  const canJoin = isSignupWindowOpen(match, now) && !match.my_state;
  const fill = Math.min(1, match.confirmed_count / Math.max(1, match.spots));

  return (
    <Card onPress={onOpen} testID={`match-card-${match.id}`} style={{ gap: 14 }} accessibilityLabel={`${formatDate.day(match.kick_off, locale)} ${formatDate.time(match.kick_off, locale)}`}>
      <View style={styles.rowBetween}>
        <Txt variant="label" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{match.club_name}</Txt>
        <StatusChip label={full ? t('status.full') : t('status.open')} tone={full ? 'warning' : 'open'} />
      </View>
      <View>
        {/* M4 M9: date and time on two deliberate lines, relative time without seconds. */}
        <Txt variant="display">{formatDate.day(match.kick_off, locale)}</Txt>
        <Txt variant="bodyStrong" tone="secondary">
          {formatDate.time(match.kick_off, locale)} · {relativeTime(match.kick_off, now)}
        </Txt>
        <VenueLine name={match.venue_name} url={match.venue_url} compact />
      </View>
      <View style={styles.spots}>
        <Txt variant="hero" style={{ color: full ? theme.colors.warning : theme.colors.text }}>{full ? match.waitlist_count : spotsLeft}</Txt>
        <Txt variant="bodyStrong" tone="secondary" style={{ flex: 1 }}>
          {full ? t('match.waitlistLabel', { count: match.waitlist_count }) : t('match.spotsLeftLabel', { count: spotsLeft })}
        </Txt>
      </View>
      <View style={styles.track} accessibilityElementsHidden>
        <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: full ? theme.colors.warning : theme.colors.text }]} />
      </View>
      <SquadPreview match={match} />
      {match.my_state ? (
        <View style={styles.mine}>
          <Ionicons name={match.my_state === 'confirmed' ? 'checkmark-circle' : 'time-outline'} size={20} color={match.my_state === 'confirmed' ? theme.colors.success : theme.colors.warning} />
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            {match.my_state === 'confirmed' ? t('match.youreIn') : t('match.onWaitlistPos', { position: match.my_queue_pos ?? '?' })}
          </Txt>
          <Txt variant="caption" tone="secondary">{t('match.viewMatch')}</Txt>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
        </View>
      ) : canJoin ? (
        <Button
          title={full ? t('match.joinWaitlist') : t('match.join')}
          variant={primary && !full ? 'primary' : 'secondary'}
          onPress={onJoin}
          loading={joining}
          testID={`join-${match.id}`}
        />
      ) : null}
    </Card>
  );
}

function DateBlock({ iso }: { iso: string }) {
  const locale = useLocaleStore((s) => s.locale);
  return (
    <View style={styles.dateBlock} accessibilityElementsHidden>
      <Txt variant="label" tone="secondary" style={{ fontSize: 10 }}>{formatDate.weekday(iso, locale)}</Txt>
      <Txt variant="number" style={{ fontSize: 24, lineHeight: 26 }}>{formatDate.dayNumber(iso, locale)}</Txt>
    </View>
  );
}

/** Compact row for upcoming, teams-picked and past matches. */
export function MatchRow({ match, now, isAdmin, onOpen }: { match: FeedMatch; now: Date; isAdmin: boolean; onOpen: () => void }) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const kicked = new Date(match.kick_off).getTime() <= now.getTime();
  let detail: string;
  let tone: 'secondary' | 'warning' | 'primary' = 'secondary';
  if (match.status === 'cancelled') detail = t('status.cancelled');
  else if (match.status === 'completed' && match.result?.length) {
    const [a, b] = match.result;
    detail = match.result.length === 2 ? `${teamLabel(a.name)} ${a.score}–${b.score} ${teamLabel(b.name)}` : match.result.map((r) => `${teamLabel(r.name)} ${r.score}`).join(' · ');
  } else if (match.status === 'completed') detail = t('match.completedPlayed', { count: match.confirmed_count });
  else if (kicked) {
    detail = isAdmin ? t('match.recordResultHint') : t('match.awaitingResult');
    tone = isAdmin ? 'warning' : 'secondary';
  } else if (match.status === 'locked') detail = t('match.teamsPickedKick', { when: relativeTime(match.kick_off, now) });
  else if (new Date(match.signup_open_at) > now) detail = t('match.signupsOpen', { when: relativeTime(match.signup_open_at, now) });
  else detail = t('match.teamsAt', { time: formatDate.time(teamsPickedAt(match.kick_off), locale) });

  return (
    <Card onPress={onOpen} testID={`match-row-${match.id}`} style={styles.row}>
      <DateBlock iso={match.kick_off} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="heading" numberOfLines={1}>
          {formatDate.day(match.kick_off, locale)} · {formatDate.time(match.kick_off, locale)}
        </Txt>
        <Txt variant="caption" tone={tone} numberOfLines={1}>{detail}</Txt>
        {match.motm.length > 0 && (
          <Txt variant="caption" tone="secondary" numberOfLines={1}>
            <Ionicons name="star" size={12} color={theme.colors.warning} /> {t('match.motmShort', { names: match.motm.join(', ') })}
          </Txt>
        )}
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {[match.club_name, match.venue_name].filter(Boolean).join(' · ')}
        </Txt>
      </View>
      {match.my_state === 'confirmed' && !kicked && <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} accessibilityLabel={t('match.youreIn')} />}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  venue: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'flex-start' },
  spots: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  squad: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  more: {
    marginLeft: -8, height: 30, minWidth: 30, paddingHorizontal: 6, borderRadius: 15, backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 2, borderColor: theme.colors.background, alignItems: 'center', justifyContent: 'center',
  },
  mine: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceRaised,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  dateBlock: {
    width: 48, height: 52, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center',
  },
});
