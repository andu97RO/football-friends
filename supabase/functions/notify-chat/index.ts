import { notify, serve } from '../_shared/common.ts';

// Pushes a new chat message to the rest of the group, for players who kept "Chat" on.
serve(async ({ user, db, body }) => {
  if (typeof body.matchId !== 'string' || typeof body.content !== 'string') throw new Error('Missing message');
  const { data: allowed } = await db.rpc('can_access_chat', { m: body.matchId });
  if (allowed !== true) throw Object.assign(new Error('Group membership required'), { code: '42501' });
  const [{ data: match }, { data: me }] = await Promise.all([
    db.from('match').select('club_id').eq('id', body.matchId).single(),
    db.from('profile').select('display_name').eq('user_id', user.id).single(),
  ]);
  const { data: members } = await db.from('group_membership').select('user_id').eq('club_id', match!.club_id).eq('status', 'approved').neq('user_id', user.id);
  const text = body.content.length > 140 ? `${body.content.slice(0, 137)}…` : body.content;
  const sent = await notify((members ?? []).map((m) => m.user_id), 'notify_chat', (locale) => ({
    title: `${me?.display_name ?? ''} · ${locale === 'ro' ? 'Chat meci' : 'Match chat'}`,
    body: text,
  }), { matchId: body.matchId, type: 'chat' });
  return { sent };
});
