import { serve } from '../_shared/common.ts';

serve(async ({ db, body }) => {
  if (typeof body.matchId !== 'string') throw new Error('Missing matchId');
  const { data, error } = await db.rpc('match_action', { action: 'join', m: body.matchId });
  if (error) throw error;
  return data;
});
