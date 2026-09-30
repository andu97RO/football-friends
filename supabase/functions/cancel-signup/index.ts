import { notify, serve, when } from '../_shared/common.ts';

// Leaving frees the place; the first waitlisted player is promoted and told straight away.
serve(async ({ db, body }) => {
  if (typeof body.matchId !== 'string') throw new Error('Missing matchId');
  const { data, error } = await db.rpc('match_action', { action: 'cancel', m: body.matchId });
  if (error) throw error;
  if (data?.promoted) {
    const { data: match } = await db.from('match').select('kick_off').eq('id', body.matchId).single();
    await notify([data.promoted], 'notify_waitlist', (locale) =>
      locale === 'ro'
        ? { title: 'Ai intrat!', body: `S-a eliberat un loc pentru ${when(match!.kick_off, locale)}. Ești confirmat.` }
        : { title: "You're in!", body: `A spot opened for ${when(match!.kick_off, locale)}. You're confirmed.` },
      { matchId: body.matchId, type: 'promoted' });
  }
  return data;
});
