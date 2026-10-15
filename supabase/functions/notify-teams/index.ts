import { notify, serve, serviceClient, when } from '../_shared/common.ts';

// Any verified caller may wake the worker; only its service client can claim
// events. Recipient IDs, match IDs and text come exclusively from the outbox.
serve(async () => {
  const service = serviceClient();
  const { data: events, error } = await service.rpc('claim_team_notifications');
  if (error) throw error;
  let delivered = 0;
  for (const event of events ?? []) {
    try {
      await notify(event.user_ids, 'notify_teams', (locale) =>
        locale === 'ro'
          ? { title: 'Echipele sunt gata', body: `Vezi în ce echipă joci pe ${when(event.kick_off, locale)}.` }
          : { title: 'Teams are picked', body: `See which team you're on for ${when(event.kick_off, locale)}.` },
        { matchId: event.match_id, type: 'teams' }, true);
      const { error: ackError } = await service.from('team_notification_outbox').delete()
        .eq('match_id', event.match_id).eq('claim_id', event.claim_id);
      if (ackError) throw ackError;
      delivered++;
    } catch (error) {
      console.error('Team notification remains queued', error);
      // Release for retry on the next feed refresh. A crashed worker's lease expires.
      await service.from('team_notification_outbox').update({ claimed_until: null })
        .eq('match_id', event.match_id).eq('claim_id', event.claim_id);
    }
  }
  return { delivered };
});
