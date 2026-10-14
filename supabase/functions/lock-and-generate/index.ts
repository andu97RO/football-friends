import { notify, serve, when } from '../_shared/common.ts';

serve(async ({ db, body }) => {
  if (typeof body.matchId !== 'string') throw new Error('Missing matchId');
  const { data, error } = await db.rpc('match_action', { action: 'generate', m: body.matchId });
  if (error) throw error;
  const [{ data: match }, { data: players }] = await Promise.all([
    db.from('match').select('kick_off').eq('id', body.matchId).single(),
    db.from('signup').select('user_id').eq('match_id', body.matchId).eq('state', 'confirmed'),
  ]);
  await notify((players ?? []).map((p) => p.user_id), 'notify_teams', (locale) =>
    locale === 'ro'
      ? { title: 'Echipele sunt gata', body: `Vezi în ce echipă joci pe ${when(match!.kick_off, locale)}.` }
      : { title: 'Teams are picked', body: `See which team you're on for ${when(match!.kick_off, locale)}.` },
    { matchId: body.matchId, type: 'teams' });
  return data;
});
