import { serve } from '../_shared/common.ts';

// Kept for older app builds; the app now calls the swap_players RPC directly.
serve(async ({ db, body }) => {
  if (typeof body.matchId !== 'string') throw new Error('Missing matchId');
  const { data, error } = await db.rpc('match_action', {
    action: 'move', m: body.matchId, player: body.playerId ?? null, source_team: body.fromTeamId ?? null, destination_team: body.toTeamId ?? null,
  });
  if (error) throw error;
  return data;
});
