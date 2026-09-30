import { createClient, SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export type Locale = 'en' | 'ro';
export type Pref = 'notify_waitlist' | 'notify_teams' | 'notify_chat' | 'notify_matches';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers, status });
}

/**
 * Wraps a POST handler with CORS, a verified-user check and a client that acts
 * as the caller (so RLS and the RPC permission checks still apply).
 */
export function serve(handler: (ctx: { user: User; db: SupabaseClient; body: Record<string, any> }) => Promise<unknown>) {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return json({}, 405);
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user?.email_confirmed_at) return json({ error: 'Verified account required' }, 401);
    try {
      const body = await req.json().catch(() => ({}));
      return json(await handler({ user, db, body }));
    } catch (error) {
      const err = error as { message?: string; code?: string };
      return json({ error: err?.message ?? 'Invalid request' }, err?.code === '42501' ? 403 : 400);
    }
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

const TIMEZONE = Deno.env.get('APP_TIMEZONE') ?? 'Europe/Bucharest';

/** "Thu 2 Oct, 20:00" in the player's language. */
export function when(iso: string, locale: Locale): string {
  const date = new Date(iso);
  const tag = locale === 'ro' ? 'ro-RO' : 'en-GB';
  const day = date.toLocaleDateString(tag, { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const time = date.toLocaleTimeString(tag, { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time}`;
}

/**
 * Sends an Expo push to each user who has a device token and has not turned
 * this kind of notification off. Text is built per recipient language.
 */
export async function notify(
  userIds: string[],
  pref: Pref,
  build: (locale: Locale) => { title: string; body: string },
  data: Record<string, unknown> = {}
): Promise<number> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return 0;
  const { data: rows, error } = await serviceClient()
    .from('profile')
    .select(`user_id,push_token,locale,${pref}`)
    .in('user_id', ids)
    .not('push_token', 'is', null);
  if (error || !rows) return 0;
  const messages = rows
    .filter((row: Record<string, any>) => row[pref] !== false && row.push_token)
    .map((row: Record<string, any>) => ({
      to: row.push_token,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      data,
      ...build(row.locale === 'ro' ? 'ro' : 'en'),
    }));
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch((error) => console.error('Push send failed', error));
  }
  return messages.length;
}
