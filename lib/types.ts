export type GroupRole = 'owner' | 'admin' | 'member';
export type SignupState = 'confirmed' | 'waitlist' | 'cancelled';

export interface Profile {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  created_at: string;
  notify_waitlist?: boolean;
  notify_teams?: boolean;
  notify_chat?: boolean;
  notify_matches?: boolean;
  locale?: 'en' | 'ro';
  onboarded?: boolean;
}

export interface Club {
  id: string;
  name: string;
  description: string;
  listed?: boolean;
}

export interface Match {
  id: string;
  club_id: string;
  kick_off: string;
  signup_open_at: string;
  spots: number;
  teams_count: number;
  status: 'scheduled' | 'locked' | 'completed' | 'cancelled';
  venue_name: string;
  venue_url: string;
  fee_amount: number;
  fee_currency: string;
  payment_note: string;
  repeat_weekly: boolean;
  next_match_id: string | null;
  created_at: string;
}

export interface SquadMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

/** Row from the match_feed() RPC: every match across the caller's groups. */
export interface FeedMatch extends Pick<Match, 'id' | 'club_id' | 'kick_off' | 'signup_open_at' | 'spots' | 'teams_count' | 'status' | 'venue_name' | 'venue_url' | 'fee_amount' | 'fee_currency' | 'repeat_weekly'> {
  club_name: string;
  confirmed_count: number;
  waitlist_count: number;
  my_state: SignupState | null;
  my_queue_pos: number | null;
  squad: SquadMember[];
  result: { name: string; score: number }[] | null;
  motm: string[];
}

export interface Signup {
  id: number;
  match_id: string;
  user_id: string;
  state: SignupState;
  queue_pos: number | null;
  paid: boolean;
  attended: boolean | null;
  created_at: string;
}

export interface Team {
  id: string;
  match_id: string;
  name: string;
  score: number | null;
}

/** Row from my_groups(): the caller's own memberships. */
export interface MyGroup {
  club_id: string;
  name: string;
  description: string;
  role: GroupRole;
  status: 'approved' | 'pending';
  rating: number | null;
  member_count: number;
  pending_requests: number;
  listed: boolean;
}

/** Row from group_members(g). Ratings are null unless you are an admin or it is you. */
export interface GroupMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: GroupRole;
  status: 'approved' | 'pending';
  rating: number | null;
  self_rating: number | null;
  created_at: string;
}

export interface PlayerStats {
  games: number;
  wins: number;
  showed_up: number | null;
  form: ('W' | 'D' | 'L')[];
  motm: number;
}

export interface MatchSummary {
  motm: { user_id: string; display_name: string }[];
  votes: number;
  my_vote: string | null;
}
