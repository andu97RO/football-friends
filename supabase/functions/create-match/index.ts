import { notify, serve, when } from '../_shared/common.ts';

const FIELDS = ['kick_off', 'signup_open_at', 'venue_name', 'venue_url', 'fee_amount', 'fee_currency', 'payment_note', 'spots', 'teams_count', 'repeat_weekly'];

// D6: creates the match as the organiser (RLS checks they are a group admin),
// then tells every other member, as the confirmation promises.
serve(async ({ user, db, body }) => {
  if (typeof body.clubId !== 'string') throw new Error('Missing clubId');
  const row: Record<string, unknown> = { club_id: body.clubId, status: 'scheduled' };
  for (const field of FIELDS) if (body[field] !== undefined) row[field] = body[field];
  const { data: match, error } = await db.from('match').insert(row).select('id,kick_off,signup_open_at').single();
  if (error) throw error;
  const [{ data: members }, { data: club }] = await Promise.all([
    db.from('group_membership').select('user_id').eq('club_id', body.clubId).eq('status', 'approved').neq('user_id', user.id),
    db.from('club').select('name').eq('id', body.clubId).single(),
  ]);
  const notified = await notify((members ?? []).map((m) => m.user_id), 'notify_matches', (locale) =>
    locale === 'ro'
      ? { title: `Meci nou · ${club?.name ?? ''}`, body: `${when(match.kick_off, locale)}. Înscrierile se deschid ${when(match.signup_open_at, locale)}.` }
      : { title: `New match · ${club?.name ?? ''}`, body: `${when(match.kick_off, locale)}. Sign-ups open ${when(match.signup_open_at, locale)}.` },
    { matchId: match.id, type: 'new-match' });
  return { id: match.id, notified };
});
