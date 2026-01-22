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
  promoted?: { userId: string; displayName: string };
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

    // Atomic cancel + auto-promote next waitlisted user
    const { data: promotedRows, error: cancelError } = await supabase.rpc('cancel_signup_atomic', {
      p_match_id: matchId,
      p_user_id: user.id,
    });

    if (cancelError) {
      throw new Error(cancelError.message || 'Failed to cancel signup');
    }

    const promoted = (promotedRows || []) as {
      user_id: string;
    }[];

    const promotedUserId = promoted[0]?.user_id;

    let promotedPayload: { userId: string; displayName: string } | undefined;

    if (promotedUserId) {
      // Fetch profile for promoted user
      const { data: profile } = await supabase
        .from('profile')
        .select('user_id, display_name, push_token')
        .eq('user_id', promotedUserId)
        .single();

      if (profile) {
        promotedPayload = {
          userId: profile.user_id,
          displayName: profile.display_name || 'Unknown',
        };

        // Send push notification to promoted user
        if (profile.push_token) {
          await sendPushNotification(
            profile.push_token,
            '🎉 You\'re In!',
            'A spot opened up and you\'ve been automatically confirmed for the match!',
            {
              matchId,
              type: 'waitlist_promotion',
            }
          );
        }
      }
    }

    const response: CancelSignupResponse = {
      success: true,
      promoted: promotedPayload,
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
