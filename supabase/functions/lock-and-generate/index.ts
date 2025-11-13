// Lock and Generate Teams Edge Function
// Locks match and generates balanced teams using serpentine draft algorithm

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LockAndGenerateRequest {
  matchId: string;
}

interface Player {
  user_id: string;
  display_name: string;
  rating: number;
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
    const { matchId }: LockAndGenerateRequest = await req.json();

    if (!matchId) {
      throw new Error('Missing matchId');
    }

    // Get match and verify user is organizer
    const { data: match, error: matchError } = await supabase
      .from('match')
      .select('*, club:club_id(organizer_id)')
      .eq('id', matchId)
      .single();

    if (matchError || !match) {
      throw new Error('Match not found');
    }

    if (match.club.organizer_id !== user.id) {
      throw new Error('Unauthorized: Not match organizer');
    }

    if (match.status === 'locked' || match.status === 'completed') {
      throw new Error('Match already locked or completed');
    }

    // Lock the match
    const { error: lockError } = await supabase
      .from('match')
      .update({ status: 'locked' })
      .eq('id', matchId);

    if (lockError) throw lockError;

    // Get confirmed signups with profiles
    const { data: signups, error: signupsError } = await supabase
      .from('signup')
      .select('user_id, profile:user_id(display_name, rating_base)')
      .eq('match_id', matchId)
      .eq('state', 'confirmed');

    if (signupsError) throw signupsError;

    if (!signups || signups.length === 0) {
      throw new Error('No confirmed signups');
    }

    // Prepare players list with ratings
    const players: Player[] = signups.map(s => ({
      user_id: s.user_id,
      display_name: s.profile?.display_name || 'Unknown',
      rating: s.profile?.rating_base || 3,
    }));

    // Sort players by rating (descending)
    players.sort((a, b) => b.rating - a.rating);

    // Generate teams using serpentine draft
    const teams = generateBalancedTeams(players, match.teams_count);

    // Delete existing teams if any
    const { error: deleteTeamsError } = await supabase
      .from('team')
      .delete()
      .eq('match_id', matchId);

    if (deleteTeamsError) throw deleteTeamsError;

    // Insert new teams and assignments
    for (let i = 0; i < teams.length; i++) {
      const teamName = `Team ${String.fromCharCode(65 + i)}`; // Team A, Team B, Team C

      // Insert team
      const { data: team, error: teamError } = await supabase
        .from('team')
        .insert({
          match_id: matchId,
          name: teamName,
        })
        .select()
        .single();

      if (teamError) throw teamError;

      // Insert team assignments
      const assignments = teams[i].map(player => ({
        team_id: team.id,
        user_id: player.user_id,
      }));

      const { error: assignmentError } = await supabase
        .from('team_assignment')
        .insert(assignments);

      if (assignmentError) throw assignmentError;

      // Insert rating snapshots
      const snapshots = teams[i].map(player => ({
        user_id: player.user_id,
        match_id: matchId,
        rating_display: player.rating,
      }));

      const { error: snapshotError } = await supabase
        .from('rating_snapshot')
        .insert(snapshots);

      if (snapshotError) throw snapshotError;
    }

    // Log audit trail
    await supabase.from('audit_log').insert({
      match_id: matchId,
      user_id: user.id,
      action: 'lock_and_generate_teams',
      meta: {
        teams_count: teams.length,
        players_count: players.length,
        team_sizes: teams.map(t => t.length),
      },
    });

    // Calculate team stats for response
    const teamStats = teams.map((team, idx) => ({
      name: `Team ${String.fromCharCode(65 + idx)}`,
      players: team.length,
      totalRating: team.reduce((sum, p) => sum + p.rating, 0),
      avgRating: (team.reduce((sum, p) => sum + p.rating, 0) / team.length).toFixed(2),
    }));

    return new Response(JSON.stringify({ success: true, teams: teamStats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in lock-and-generate:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

/**
 * Generates balanced teams using serpentine draft algorithm
 * @param players - Sorted players list (descending by rating)
 * @param teamsCount - Number of teams to generate
 * @returns Array of teams, each containing players
 */
function generateBalancedTeams(players: Player[], teamsCount: number): Player[][] {
  const teams: Player[][] = Array.from({ length: teamsCount }, () => []);

  let currentTeam = 0;
  let direction = 1; // 1 for forward, -1 for backward

  for (const player of players) {
    teams[currentTeam].push(player);

    // Move to next team
    currentTeam += direction;

    // Reverse direction at boundaries (serpentine)
    if (currentTeam === teamsCount) {
      currentTeam = teamsCount - 1;
      direction = -1;
    } else if (currentTeam < 0) {
      currentTeam = 0;
      direction = 1;
    }
  }

  // Optional: Local swaps to reduce variance
  // This is a simple implementation; can be enhanced with more sophisticated algorithms
  for (let i = 0; i < 10; i++) {
    const improved = tryImproveBalance(teams);
    if (!improved) break;
  }

  return teams;
}

/**
 * Attempts to improve team balance by swapping players between teams
 * @param teams - Current teams
 * @returns true if a swap was made, false otherwise
 */
function tryImproveBalance(teams: Player[][]): boolean {
  const teamTotals = teams.map(team => team.reduce((sum, p) => sum + p.rating, 0));
  const maxTotal = Math.max(...teamTotals);
  const minTotal = Math.min(...teamTotals);
  const variance = maxTotal - minTotal;

  if (variance <= 1) return false; // Already balanced

  const maxTeamIdx = teamTotals.indexOf(maxTotal);
  const minTeamIdx = teamTotals.indexOf(minTotal);

  const maxTeam = teams[maxTeamIdx];
  const minTeam = teams[minTeamIdx];

  // Try to find a beneficial swap
  for (let i = 0; i < maxTeam.length; i++) {
    for (let j = 0; j < minTeam.length; j++) {
      const diff = maxTeam[i].rating - minTeam[j].rating;

      if (diff > 0 && diff < variance) {
        // Swap would improve balance
        const temp = maxTeam[i];
        maxTeam[i] = minTeam[j];
        minTeam[j] = temp;
        return true;
      }
    }
  }

  return false;
}
