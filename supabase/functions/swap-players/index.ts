// Swap Players Edge Function
// Allows admin to move players between teams

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SwapPlayersRequest {
  matchId: string;
  playerId: string;
  fromTeamId: string;
  toTeamId: string;
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
    const { matchId, playerId, fromTeamId, toTeamId }: SwapPlayersRequest = await req.json();

    if (!matchId || !playerId || !fromTeamId || !toTeamId) {
      throw new Error('Missing required parameters');
    }

    // Get match and verify user is organizer or admin
    const { data: match, error: matchError } = await supabase
      .from('match')
      .select('*, club:club_id(organizer_id)')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      throw new Error('Match not found');
    }

    // Check if user is organizer
    const isOrganizer = match.club.organizer_id === user.id;

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profile')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    const isAdmin = profile?.is_admin === true;

    if (!isOrganizer && !isAdmin) {
      throw new Error('Unauthorized: Not match organizer or admin');
    }

    // Verify match is locked (not scheduled, completed, or cancelled)
    if (match.status !== 'locked') {
      throw new Error('Can only edit teams for locked matches');
    }

    // Get team names for notification
    const { data: fromTeam } = await supabase
      .from('team')
      .select('name')
      .eq('id', fromTeamId)
      .single();

    const { data: toTeam } = await supabase
      .from('team')
      .select('name')
      .eq('id', toTeamId)
      .single();

    if (!fromTeam || !toTeam) {
      throw new Error('Teams not found');
    }

    // Update team assignment
    const { error: updateError } = await supabase
      .from('team_assignment')
      .update({ team_id: toTeamId })
      .eq('team_id', fromTeamId)
      .eq('user_id', playerId);

    if (updateError) throw updateError;

    // Log audit trail
    await supabase.from('audit_log').insert({
      match_id: matchId,
      user_id: user.id,
      action: 'swap_player_team',
      meta: {
        player_id: playerId,
        from_team_id: fromTeamId,
        to_team_id: toTeamId,
        from_team_name: fromTeam.name,
        to_team_name: toTeam.name,
      },
    });

    // Send push notification to player
    const { data: playerProfile } = await supabase
      .from('profile')
      .select('push_token, display_name')
      .eq('user_id', playerId)
      .single();

    if (playerProfile?.push_token) {
      await sendPushNotification(
        playerProfile.push_token,
        'Team Assignment Updated',
        `You've been moved to ${toTeam.name}!`,
        { matchId, teamId: toTeamId }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Player moved from ${fromTeam.name} to ${toTeam.name}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in swap-players:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
