import { notify, serve, serviceClient } from '../_shared/common.ts';

// Pushes a message the caller just posted to the rest of the group, for players
// who kept "Chat" on. The text is read from the stored message, never the request.
serve(async ({ user, db, body }) => {
  if (typeof body.messageId !== 'string') throw new Error('Missing messageId');
  const { data: claimed, error } = await serviceClient().rpc('claim_chat_push', { message: body.messageId, sender: user.id });
  if (error) throw error;
  const message = claimed?.[0] as { match_id: string; content: string } | undefined;
  if (!message) return { sent: 0 };
  const { data: allowed } = await db.rpc('can_access_chat', { m: message.match_id });
  if (allowed !== true) throw Object.assign(new Error('Group membership required'), { code: '42501' });
  const [{ data: match }, { data: me }] = await Promise.all([
    db.from('match').select('club_id').eq('id', message.match_id).single(),
    db.from('profile').select('display_name').eq('user_id', user.id).single(),
  ]);
  const { data: members } = await db.from('group_membership').select('user_id').eq('club_id', match!.club_id).eq('status', 'approved').neq('user_id', user.id);
  const text = message.content.length > 140 ? `${message.content.slice(0, 137)}…` : message.content;
  const sent = await notify((members ?? []).map((m) => m.user_id), 'notify_chat', (locale) => ({
    title: `${me?.display_name ?? ''} · ${locale === 'ro' ? 'Chat meci' : 'Match chat'}`,
    body: text,
  }), { matchId: message.match_id, type: 'chat' });
  return { sent };
});
