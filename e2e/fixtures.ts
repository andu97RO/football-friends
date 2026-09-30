import { test as base, expect, Page, Route } from '@playwright/test';

export const user = { id: 'user123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }], email_confirmed_at: '2025-01-01T00:00:00Z' };
export const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };

const HOUR = 3600000;
const DAY = 24 * HOUR;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
const names = ['Mihai Ionescu', 'Vlad Pop', 'Radu Stan', 'Cristi Dima', 'Tudor Marin', 'Paul Enache', 'Dan Rusu', 'Alex Toma', 'George Lupu', 'Sorin Neagu', 'Florin Iancu', 'Ionuț Barbu', 'Marius Stoica', 'Dragoș Voicu', 'Adi Preda', 'Bogdan Ene', 'Ștefan Dobre'];

type Row = Record<string, any>;

export function initialBackend() {
  const players = names.map((name, i) => ({ user_id: `p${i + 1}`, display_name: name, avatar_url: null, created_at: '2025-01-01' }));
  const profiles: Row[] = [
    { user_id: user.id, display_name: 'Andrei B.', avatar_url: null, created_at: '2025-01-01', notify_waitlist: true, notify_teams: true, notify_chat: true, notify_matches: true, locale: 'en', onboarded: true },
    ...players.map((p) => ({ ...p, notify_waitlist: true, notify_teams: true, notify_chat: true, notify_matches: true, locale: 'en', onboarded: true })),
    { user_id: 'applicant', display_name: 'Cristian Popescu', avatar_url: null, created_at: '2025-01-01', onboarded: true },
  ];
  const memberships: Row[] = [
    { club_id: 'club1', user_id: user.id, role: 'owner', status: 'approved', rating: 4, self_rating: 3, created_at: '2025-01-01' },
    ...players.map((p, i) => ({ club_id: 'club1', user_id: p.user_id, role: i === 0 ? 'admin' : 'member', status: 'approved', rating: [5, 3, 3, 3, 5, 2, 2, 4, 3, 3, 3, 4, 4, 3, 3, 3, 3][i], self_rating: 3, created_at: '2025-01-02' })),
  ];
  const groups: Row[] = [
    { id: 'club1', name: 'Thursday 6-a-side', description: 'Every Thursday at Arena', listed: false, invite_code: 'AB12CD34' },
    { id: 'club2', name: 'Tuesday Five', description: 'Casual 5-a-side, 21:00 every Tuesday', listed: true, invite_code: 'TUE55555' },
  ];
  const matches: Row[] = [
    { id: 'match1', club_id: 'club1', kick_off: iso(2 * DAY), signup_open_at: iso(-DAY), spots: 18, teams_count: 3, status: 'scheduled', venue_name: 'Arena Sport, pitch 2', venue_url: '', fee_amount: 25, fee_currency: 'RON', payment_note: 'Cash to Andrei on the day', repeat_weekly: true, next_match_id: null, created_at: '2025-01-01' },
    { id: 'match2', club_id: 'club1', kick_off: iso(9 * DAY), signup_open_at: iso(5 * DAY), spots: 18, teams_count: 3, status: 'scheduled', venue_name: 'Arena Sport, pitch 2', venue_url: '', fee_amount: 25, fee_currency: 'RON', payment_note: '', repeat_weekly: false, next_match_id: null, created_at: '2025-01-01' },
    { id: 'match3', club_id: 'club1', kick_off: iso(-5 * DAY), signup_open_at: iso(-8 * DAY), spots: 18, teams_count: 2, status: 'completed', venue_name: 'Arena Sport', venue_url: '', fee_amount: 0, fee_currency: 'RON', payment_note: '', repeat_weekly: false, next_match_id: null, created_at: '2025-01-01' },
  ];
  let signupId = 1;
  const signups: Row[] = [
    ...players.slice(0, 14).map((p, i) => ({ id: signupId++, match_id: 'match1', user_id: p.user_id, state: 'confirmed', queue_pos: null, paid: i < 11, attended: null, created_at: iso(-DAY + i * 60000) })),
    ...[user.id, ...players.slice(0, 5).map((p) => p.user_id)].map((u) => ({ id: signupId++, match_id: 'match3', user_id: u, state: 'confirmed', queue_pos: null, paid: true, attended: true, created_at: iso(-7 * DAY) })),
  ];
  const teams: Row[] = [
    { id: 'teamA', match_id: 'match3', name: 'Team A', score: 5 },
    { id: 'teamB', match_id: 'match3', name: 'Team B', score: 3 },
  ];
  const assignments: Row[] = [
    { team_id: 'teamA', user_id: user.id }, { team_id: 'teamA', user_id: 'p2' }, { team_id: 'teamA', user_id: 'p3' },
    { team_id: 'teamB', user_id: 'p1' }, { team_id: 'teamB', user_id: 'p4' }, { team_id: 'teamB', user_id: 'p5' },
  ];
  const chat: Row[] = [
    { id: 'c1', match_id: 'match1', user_id: 'p1', content: 'Who is bringing the bibs this week?', created_at: iso(-2 * HOUR) },
    { id: 'c2', match_id: 'match1', user_id: user.id, content: 'I have them, bringing both sets.', created_at: iso(-HOUR) },
  ];
  return { profiles, memberships, groups, matches, signups, teams, assignments, chat, votes: [] as Row[], requests: [] as { path: string; body: Record<string, any> }[], nextSignup: () => signupId++ };
}

type Backend = ReturnType<typeof initialBackend>;

function roleOf(state: Backend, club: string, uid = user.id) {
  const m = state.memberships.find((x) => x.club_id === club && x.user_id === uid && x.status === 'approved');
  return m?.role ?? null;
}

function feed(state: Backend) {
  return state.matches
    .filter((m) => roleOf(state, m.club_id))
    .sort((a, b) => a.kick_off.localeCompare(b.kick_off))
    .map((m) => {
      const s = state.signups.filter((x) => x.match_id === m.id);
      const mine = s.find((x) => x.user_id === user.id && x.state !== 'cancelled');
      const confirmed = s.filter((x) => x.state === 'confirmed');
      const scored = state.teams.filter((t) => t.match_id === m.id && t.score !== null);
      return {
        ...m,
        club_name: state.groups.find((g) => g.id === m.club_id)?.name,
        confirmed_count: confirmed.length,
        waitlist_count: s.filter((x) => x.state === 'waitlist').length,
        my_state: mine?.state ?? null,
        my_queue_pos: mine?.queue_pos ?? null,
        squad: confirmed.slice(0, 4).map((x) => state.profiles.find((p) => p.user_id === x.user_id)),
        result: scored.length ? scored.map((t) => ({ name: t.name, score: t.score })) : null,
        motm: m.id === 'match3' ? ['Vlad Pop'] : [],
      };
    });
}

function applyFilters(rows: Row[], url: URL): Row[] {
  return rows.filter((row) =>
    [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit', 'offset'].includes(key) || !(key in row)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('neq.')) return String(row[key]) !== value.slice(4);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').map((v) => v.replace(/"/g, '')).includes(String(row[key]));
      if (value.startsWith('ilike.')) return String(row[key]).toLowerCase().includes(value.slice(6).replaceAll('%', '').toLowerCase());
      return true;
    })
  );
}

export const test = base.extend<{ backend: Backend }>({
  backend: async ({ page }, fixtureUse) => {
    const state = initialBackend();
    await page.routeWebSocket(/supabase/, (socket) => socket.close());
    await page.route('https://*.supabase.co/**', async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const body = request.postData() ? request.postDataJSON() : {};
      if (method !== 'GET' && method !== 'HEAD') state.requests.push({ path, body });
      const single = request.headers().accept?.includes('object');
      const respond = (rows: Row[]) => route.fulfill({ json: single ? rows[0] ?? null : rows });

      // Auth
      if (path.includes('/auth/v1/token')) return route.fulfill({ json: session });
      if (path.includes('/auth/v1/user')) return route.fulfill({ json: method === 'PUT' ? { ...user } : user });
      if (path.includes('/auth/v1/logout')) return route.fulfill({ json: {} });
      if (path.includes('/auth/v1/signup')) return route.fulfill({ json: { user: { ...user, email_confirmed_at: null }, session: null } });
      if (path.includes('/auth/v1/recover') || path.includes('/auth/v1/otp') || path.includes('/auth/v1/resend')) return route.fulfill({ json: {} });

      // Edge Functions
      if (path.includes('/functions/v1/')) {
        const name = path.split('/').pop();
        if (name === 'join-match') {
          const match = state.matches.find((m) => m.id === body.matchId)!;
          const confirmed = state.signups.filter((s) => s.match_id === match.id && s.state === 'confirmed').length;
          const waiting = state.signups.filter((s) => s.match_id === match.id && s.state === 'waitlist').length;
          const signupState = confirmed < match.spots ? 'confirmed' : 'waitlist';
          state.signups.push({ id: state.nextSignup(), match_id: match.id, user_id: user.id, state: signupState, queue_pos: signupState === 'waitlist' ? waiting + 1 : null, paid: false, attended: null, created_at: new Date().toISOString() });
          return route.fulfill({ json: { success: true, state: signupState, position: signupState === 'waitlist' ? waiting + 1 : null } });
        }
        if (name === 'cancel-signup') {
          const s = state.signups.find((x) => x.match_id === body.matchId && x.user_id === user.id && x.state !== 'cancelled');
          if (s) s.state = 'cancelled';
          return route.fulfill({ json: { success: true, promoted: null } });
        }
        if (name === 'create-match') {
          const { clubId, ...rest } = body;
          const match = { id: 'new-match', club_id: clubId, status: 'scheduled', next_match_id: null, created_at: new Date().toISOString(), ...rest };
          state.matches.push(match);
          return route.fulfill({ json: { id: match.id, notified: 3 } });
        }
        if (name === 'lock-and-generate') {
          const m = state.matches.find((x) => x.id === body.matchId);
          if (m) m.status = 'locked';
          return route.fulfill({ json: { success: true } });
        }
        return route.fulfill({ json: { success: true } });
      }

      // RPCs
      if (path.includes('/rest/v1/rpc/')) {
        const name = path.split('/').pop();
        switch (name) {
          case 'initialize_profile':
          case 'sync_matches':
            return route.fulfill({ json: null });
          case 'my_groups':
            return route.fulfill({
              json: state.memberships.filter((m) => m.user_id === user.id).map((m) => {
                const g = state.groups.find((x) => x.id === m.club_id)!;
                const admin = m.status === 'approved' && ['owner', 'admin'].includes(m.role);
                return {
                  club_id: g.id, name: g.name, description: g.description, role: m.role, status: m.status, rating: m.status === 'approved' ? m.rating : null,
                  member_count: state.memberships.filter((x) => x.club_id === g.id && x.status === 'approved').length,
                  pending_requests: admin ? state.memberships.filter((x) => x.club_id === g.id && x.status === 'pending').length : 0, listed: g.listed,
                };
              }),
            });
          case 'match_feed':
            return route.fulfill({ json: feed(state) });
          case 'group_members': {
            const role = roleOf(state, body.g);
            const admin = role === 'owner' || role === 'admin';
            return route.fulfill({
              json: state.memberships
                .filter((m) => m.club_id === body.g && (m.status === 'approved' || (admin && m.status === 'pending')))
                .map((m) => {
                  const p = state.profiles.find((x) => x.user_id === m.user_id)!;
                  return { user_id: m.user_id, display_name: p.display_name, avatar_url: null, role: m.role, status: m.status, rating: admin || m.user_id === user.id ? m.rating : null, self_rating: admin ? m.self_rating : null, created_at: m.created_at };
                }),
            });
          }
          case 'group_invite':
            return route.fulfill({ json: state.groups.find((g) => g.id === body.g)?.invite_code });
          case 'group_by_code': {
            const g = state.groups.find((x) => x.invite_code === String(body.code).toUpperCase());
            return route.fulfill({ json: g ? [{ club_id: g.id, name: g.name, description: g.description, member_count: 5, my_status: state.memberships.find((m) => m.club_id === g.id && m.user_id === user.id)?.status ?? null }] : [] });
          }
          case 'group_action': {
            const { action, g, target, value, description } = body;
            let id = g;
            if (action === 'create') {
              id = 'created-group';
              state.groups.push({ id, name: value, description, listed: false, invite_code: 'NEWGROUP' });
              state.memberships.push({ club_id: id, user_id: user.id, role: 'owner', status: 'approved', rating: 3, self_rating: 3, created_at: '2026-01-01' });
            } else if (action === 'join_code') {
              id = state.groups.find((x) => x.invite_code === value)?.id;
              state.memberships.push({ club_id: id, user_id: user.id, role: 'member', status: 'approved', rating: 3, self_rating: 3, created_at: '2026-01-01' });
            } else if (action === 'request') {
              state.memberships.push({ club_id: g, user_id: user.id, role: 'member', status: 'pending', rating: 3, self_rating: 3, created_at: '2026-01-01' });
            } else if (action === 'withdraw') {
              state.memberships = state.memberships.filter((m) => !(m.club_id === g && m.user_id === user.id && m.status === 'pending'));
            } else if (action === 'listed') {
              state.groups.find((x) => x.id === g)!.listed = value === 'true';
            } else if (action === 'remove') {
              state.memberships = state.memberships.filter((m) => !(m.club_id === g && m.user_id === target));
            } else {
              const m = state.memberships.find((x) => x.club_id === g && x.user_id === target);
              if (m && action === 'review') m.status = value;
              if (m && action === 'role') m.role = value;
              if (m && action === 'rating') m.rating = Number(value);
            }
            return route.fulfill({ json: id });
          }
          case 'team_summary':
            return route.fulfill({
              json: state.teams.filter((t) => t.match_id === body.m).map((t) => {
                const ids = state.assignments.filter((a) => a.team_id === t.id).map((a) => a.user_id);
                const ratings = ids.map((u) => state.memberships.find((m) => m.user_id === u && m.club_id === 'club1')?.rating ?? 3);
                return { team_id: t.id, avg_rating: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10, players: ids.length };
              }),
            });
          case 'match_summary':
            return route.fulfill({ json: { motm: body.m === 'match3' ? [{ user_id: 'p2', display_name: 'Vlad Pop' }] : [], votes: state.votes.length + (body.m === 'match3' ? 3 : 0), my_vote: state.votes.find((v) => v.match_id === body.m)?.target ?? null } });
          case 'player_stats':
            return route.fulfill({ json: { games: 23, wins: 11, motm: 3, showed_up: 96, form: ['W', 'W', 'L', 'D', 'W'] } });
          case 'vote_motm':
            state.votes = state.votes.filter((v) => v.match_id !== body.m).concat({ match_id: body.m, target: body.target });
            return route.fulfill({ json: null });
          case 'swap_players': {
            const a = state.assignments.find((x) => x.user_id === body.a && state.teams.some((t) => t.id === x.team_id && t.match_id === body.m))!;
            const b = state.assignments.find((x) => x.user_id === body.b && state.teams.some((t) => t.id === x.team_id && t.match_id === body.m))!;
            [a.team_id, b.team_id] = [b.team_id, a.team_id];
            return route.fulfill({ json: null });
          }
          case 'record_result': {
            for (const t of state.teams.filter((x) => x.match_id === body.m)) t.score = body.scores[t.id] ?? null;
            for (const s of state.signups.filter((x) => x.match_id === body.m && x.state === 'confirmed')) s.attended = !body.absent.includes(s.user_id);
            state.matches.find((m) => m.id === body.m)!.status = 'completed';
            return route.fulfill({ json: null });
          }
          case 'set_paid': {
            const s = state.signups.find((x) => x.match_id === body.m && x.user_id === body.player);
            if (s) s.paid = body.is_paid;
            return route.fulfill({ json: null });
          }
          case 'complete_onboarding':
            Object.assign(state.profiles[0], { display_name: body.name, onboarded: true });
            return route.fulfill({ json: null });
          case 'match_action':
            return route.fulfill({ json: { success: true } });
          case 'can_access_chat': {
            const match = state.matches.find((m) => m.id === body.m);
            return route.fulfill({ json: !!match && !!roleOf(state, match.club_id) });
          }
        }
        return route.fulfill({ status: 400, json: { message: `Unexpected RPC ${name}` } });
      }

      // Tables
      const table = path.split('/').pop();
      if (table === 'profile') {
        if (method === 'PATCH') Object.assign(state.profiles[0], body);
        return respond(applyFilters(state.profiles, url));
      }
      if (table === 'club') return respond(applyFilters(state.groups, url));
      if (table === 'group_membership') return respond(applyFilters(state.memberships, url));
      if (table === 'match') {
        if (method === 'PATCH') {
          Object.assign(state.matches.find((m) => m.id === url.searchParams.get('id')?.slice(3))!, body);
          return route.fulfill({ status: 204, body: '' });
        }
        if (method === 'DELETE') {
          state.matches = state.matches.filter((m) => `eq.${m.id}` !== url.searchParams.get('id'));
          return route.fulfill({ status: 204, body: '' });
        }
        return respond(applyFilters(state.matches, url).map((m) => ({ ...m, club: { name: state.groups.find((g) => g.id === m.club_id)?.name } })));
      }
      if (table === 'signup') {
        const rows = applyFilters(state.signups, url);
        if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': `*/${rows.length}`, 'access-control-expose-headers': 'content-range' }, body: '' });
        return respond(rows);
      }
      if (table === 'team') {
        return respond(applyFilters(state.teams, url).map((t) => ({ ...t, team_assignment: state.assignments.filter((a) => a.team_id === t.id).map((a) => ({ user_id: a.user_id })) })));
      }
      if (table === 'rating_snapshot') {
        const m = url.searchParams.get('match_id')?.slice(3);
        const teamIds = state.teams.filter((t) => t.match_id === m).map((t) => t.id);
        return respond(state.assignments.filter((a) => teamIds.includes(a.team_id)).map((a) => ({ user_id: a.user_id, rating_display: state.memberships.find((x) => x.user_id === a.user_id)?.rating ?? 3 })));
      }
      if (table === 'chat_message') {
        if (method === 'POST') {
          state.chat.push({ id: `c${state.chat.length + 1}`, created_at: new Date().toISOString(), ...body });
          return route.fulfill({ status: 201, body: '' });
        }
        return respond(applyFilters(state.chat, url).map((c) => ({ ...c, profile: { display_name: state.profiles.find((p) => p.user_id === c.user_id)?.display_name } })));
      }
      return route.fulfill({ status: 400, json: { message: `Unexpected mock request: ${method} ${path}` } });
    });
    await fixtureUse(state);
  },
});
export { expect };

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByTestId('email-input').fill(user.email);
  await page.getByTestId('password-input').fill('password123');
  await page.getByTestId('sign-in-button').click();
  await expect(page).toHaveURL(/matches/);
}
