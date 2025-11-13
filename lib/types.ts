export interface Profile {
  user_id: string;
  display_name: string;
  rating_base: number;
  created_at: string;
}

export interface Club {
  id: string;
  name: string;
  organizer_id: string;
  created_at: string;
}

export interface Match {
  id: string;
  club_id: string;
  kick_off: string;
  signup_open_at: string;
  spots: number;
  teams_count: number;
  status: 'scheduled' | 'locked' | 'completed' | 'cancelled';
  created_at: string;
}

export interface Signup {
  id: number;
  match_id: string;
  user_id: string;
  state: 'confirmed' | 'waitlist' | 'cancelled';
  queue_pos: number | null;
  hold_expires_at: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  match_id: string;
  name: string;
}

export interface TeamAssignment {
  team_id: string;
  user_id: string;
}

export interface RatingSnapshot {
  user_id: string;
  match_id: string;
  rating_display: number;
  elo_before: number | null;
  elo_after: number | null;
}

export interface PostMatchVote {
  match_id: string;
  voter_id: string;
  target_id: string;
  stars: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  match_id: string | null;
  user_id: string | null;
  action: string;
  meta: Record<string, any> | null;
  created_at: string;
}
