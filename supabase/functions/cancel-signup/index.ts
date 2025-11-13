// Cancel Signup Edge Function
// Handles signup cancellation with automatic waitlist promotion

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelSignupRequest {
  matchId: string;
}

interface CancelSignupResponse {
  success: boolean;
  promoted?: {
    userId: string;
    displayName: string;
  };
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client with service role
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
    const { matchId }: CancelSignupRequest = await req.json();

    if (!matchId) {
      throw new Error('Missing matchId');
    }

    // Get user's signup
    const { data: signup, error: signupError } = await supabase
      .from('signup')
      .select('*')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .single();

    if (signupError || !signup) {
      throw new Error('Signup not found');
    }

    if (signup.state === 'cancelled') {
      throw new Error('Already cancelled');
    }

    const wasConfirmed = signup.state === 'confirmed';

    // Cancel the signup
    const { error: cancelError } = await supabase
      .from('signup')
      .update({ state: 'cancelled', queue_pos: null })
      .eq('id', signup.id);

    if (cancelError) throw cancelError;

    // Log audit trail
    await supabase.from('audit_log').insert({
      match_id: matchId,
      user_id: user.id,
      action: 'cancel_signup',
      meta: { was_confirmed: wasConfirmed },
    });

    let promoted = undefined;

    // If user was confirmed, promote first waitlisted user
    if (wasConfirmed) {
      const { data: waitlistSignups } = await supabase
        .from('signup')
        .select('*, profile:user_id(display_name)')
        .eq('match_id', matchId)
        .eq('state', 'waitlist')
        .order('queue_pos', { ascending: true })
        .limit(1);

      if (waitlistSignups && waitlistSignups.length > 0) {
        const firstWaitlisted = waitlistSignups[0];

        // Promote to confirmed
        const { error: promoteError } = await supabase
          .from('signup')
          .update({ state: 'confirmed', queue_pos: null })
          .eq('id', firstWaitlisted.id);

        if (promoteError) throw promoteError;

        // Update queue positions for remaining waitlist
        const { data: remainingWaitlist } = await supabase
          .from('signup')
          .select('*')
          .eq('match_id', matchId)
          .eq('state', 'waitlist')
          .order('queue_pos', { ascending: true });

        if (remainingWaitlist) {
          for (let i = 0; i < remainingWaitlist.length; i++) {
            await supabase
              .from('signup')
              .update({ queue_pos: i + 1 })
              .eq('id', remainingWaitlist[i].id);
          }
        }

        // Log promotion
        await supabase.from('audit_log').insert({
          match_id: matchId,
          user_id: firstWaitlisted.user_id,
          action: 'promoted_from_waitlist',
          meta: { previous_queue_pos: firstWaitlisted.queue_pos },
        });

        promoted = {
          userId: firstWaitlisted.user_id,
          displayName: firstWaitlisted.profile?.display_name || 'Unknown',
        };

        // TODO: Send push notification to promoted user
        // This would integrate with OneSignal API here
      }
    }

    const response: CancelSignupResponse = {
      success: true,
      promoted,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in cancel-signup:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
