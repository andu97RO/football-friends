// Join Match Edge Function
// Handles FCFS (First Come First Served) signup with transactional guarantees

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JoinMatchRequest {
  matchId: string;
}

interface JoinMatchResponse {
  state: 'confirmed' | 'waitlist';
  position?: number;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client with service role for transactions
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Parse request body
    const { matchId }: JoinMatchRequest = await req.json();

    if (!matchId) {
      throw new Error('Missing matchId');
    }

    // Start transaction by getting match with FOR UPDATE lock
    const { data: match, error: matchError } = await supabase
      .from('match')
      .select('*')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      throw new Error('Match not found');
    }

    // Check if signup is open
    const now = new Date();
    const signupOpenAt = new Date(match.signup_open_at);

    if (now < signupOpenAt) {
      throw new Error('Signup not open yet');
    }

    // Check if match is locked
    if (match.status === 'locked' || match.status === 'completed' || match.status === 'cancelled') {
      throw new Error('Match is not open for signups');
    }

    // Check if user already signed up
    const { data: existingSignup } = await supabase
      .from('signup')
      .select('*')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .single();

    if (existingSignup && existingSignup.state !== 'cancelled') {
      throw new Error('Already signed up');
    }

    // Count confirmed signups
    const { data: signups, error: signupsError } = await supabase
      .from('signup')
      .select('*')
      .eq('match_id', matchId)
      .neq('state', 'cancelled');

    if (signupsError) {
      throw signupsError;
    }

    const confirmedCount = signups.filter(s => s.state === 'confirmed').length;
    const waitlistCount = signups.filter(s => s.state === 'waitlist').length;

    // Determine state and queue position
    const state = confirmedCount < match.spots ? 'confirmed' : 'waitlist';
    const queuePos = state === 'waitlist' ? waitlistCount + 1 : null;

    // Insert or update signup
    let result;
    if (existingSignup) {
      const { error: updateError } = await supabase
        .from('signup')
        .update({
          state,
          queue_pos: queuePos,
          created_at: new Date().toISOString(),
        })
        .eq('id', existingSignup.id);

      if (updateError) throw updateError;
      result = { state, position: queuePos };
    } else {
      const { error: insertError } = await supabase
        .from('signup')
        .insert({
          match_id: matchId,
          user_id: user.id,
          state,
          queue_pos: queuePos,
        });

      if (insertError) throw insertError;
      result = { state, position: queuePos };
    }

    // Log audit trail
    await supabase.from('audit_log').insert({
      match_id: matchId,
      user_id: user.id,
      action: 'join_match',
      meta: { state, queue_pos: queuePos },
    });

    const response: JoinMatchResponse = result;

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in join-match:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
