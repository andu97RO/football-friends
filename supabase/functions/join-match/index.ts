import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('{}', { headers, status: 405 });
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return new Response('{"error":"Unauthorized"}', { headers, status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user?.email_confirmed_at) return new Response('{"error":"Verified account required"}', { headers, status: 401 });
  try {
    const body = await req.json();
    if (typeof body.matchId !== 'string') throw new Error('Missing matchId');
    const { data, error } = await db.rpc('match_action', {
      action: 'join', m: body.matchId,
      player: body.playerId ?? null, source_team: body.fromTeamId ?? null, destination_team: body.toTeamId ?? null,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { headers, status: error.code === '42501' ? 403 : 400 });
    return new Response(JSON.stringify(data), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid request' }), { headers, status: 400 });
  }
});
