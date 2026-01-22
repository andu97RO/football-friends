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

/**
 * Send push notification via Expo Push API
 */
async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
      priority: 'high',
      channelId: 'default',
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error sending push notification:', error);
    }
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
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

    // Atomic join (capacity includes reserved invitations)
    const { data: joinResult, error: joinError } = await supabase.rpc('join_match_atomic', {
      p_match_id: matchId,
      p_user_id: user.id,
    });

    if (joinError) {
      throw new Error(joinError.message || 'Failed to join match');
    }

    const row = Array.isArray(joinResult) ? joinResult[0] : joinResult;
    const state = row?.state as 'confirmed' | 'waitlist';
    const queuePos = (row?.queue_pos ?? null) as number | null;

    const result = { state, position: queuePos ?? undefined };

    // Send push notification
    const { data: profile } = await supabase
      .from('profile')
      .select('push_token, display_name')
      .eq('user_id', user.id)
      .single();

    if (profile?.push_token) {
      const title = state === 'confirmed' ? '✅ You\'re in!' : '📋 You\'re on the waitlist';
      const body = state === 'confirmed' 
        ? 'You\'re confirmed for the match!' 
        : `You\'re #${queuePos} on the waitlist.`;
      
      await sendPushNotification(
        profile.push_token,
        title,
        body,
        { matchId }
      );
    }

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
