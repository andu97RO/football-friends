import { test as base, expect, Page } from '@playwright/test';

export const user = { id: 'user123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, email_confirmed_at: '2025-01-01T00:00:00Z' };
export const session = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
export function initialBackend() {
  return {
    profile: { user_id: user.id, display_name: 'Test Player', avatar_url: null, created_at: '2025-01-01' },
    groups: [{ id: 'club1', name: 'Monday Friends', description: 'Monday football' }, { id: 'club2', name: 'Sunday Friends', description: 'Sunday football' }],
    memberships: [{ club_id: 'club1', user_id: user.id, role: 'owner', status: 'approved', rating: 0, created_at: '2025-01-01' }],
    matches: [{ id: 'match1', club_id: 'club1', kick_off: new Date(Date.now()+86400000).toISOString(), signup_open_at: new Date(Date.now()-3600000).toISOString(), spots: 10, teams_count: 2, status: 'scheduled', created_at: '2025-01-01' }],
    signups: [] as { id: number; match_id: string; user_id: string; state: string; queue_pos: number | null }[],
    requests: [] as { path: string; body: Record<string, unknown> }[],
  };
}
type Backend = ReturnType<typeof initialBackend>;
export const test = base.extend<{ backend: Backend }>({
  backend: async ({ page }, fixtureUse) => {
    const state = initialBackend();
    await page.routeWebSocket(/supabase/, socket => socket.close());
    await page.route('https://*.supabase.co/**', async route => {
      const request=route.request(); const url=new URL(request.url()); const path=url.pathname;
      const body=request.postData() ? request.postDataJSON() : {};
      if (request.method() !== 'GET') state.requests.push({path,body});
      if (path.includes('/auth/v1/token')) return route.fulfill({json:session});
      if (path.includes('/auth/v1/user')) return route.fulfill({json:user});
      if (path.includes('/auth/v1/logout')) return route.fulfill({json:{}});
      if (path.includes('/auth/v1/signup')) return route.fulfill({json:{user:{...user,email_confirmed_at:null},session:null}});
      if (path.includes('/auth/v1/recover')) return route.fulfill({json:{}});
      if (path.includes('/functions/v1/')) {
        if(path.endsWith('join-match')) state.signups.push({id:1,match_id:body.matchId,user_id:user.id,state:'confirmed',queue_pos:null});
        return route.fulfill({json:{success:true,state:'confirmed'}});
      }
      if (path.endsWith('/rpc/initialize_profile')) return route.fulfill({json:null});
      if (path.endsWith('/rpc/get_match_capacity')) return route.fulfill({json:state.matches.map(m=>({match_id:m.id,confirmed_count:state.signups.filter(s=>s.match_id===m.id&&s.state==='confirmed').length,reserved_count:0}))});
      if (path.endsWith('/rpc/can_access_chat')) return route.fulfill({json:false});
      if (path.endsWith('/rpc/group_action')) {
        const {action,g,target,value,description}=body;
        let id=g;
        if(action==='create') {
          id='created-group'; state.groups.push({id,name:value,description});
          state.memberships.push({club_id:id,user_id:user.id,role:'owner',status:'approved',rating:0,created_at:'2026-01-01'});
        } else if(action==='request') state.memberships.push({club_id:g,user_id:user.id,role:'member',status:'pending',rating:0,created_at:'2026-01-01'});
        else {
          const m=state.memberships.find(m=>m.club_id===g&&m.user_id===target);
          if(m&&action==='review')m.status=value;
          if(m&&action==='role')m.role=value;
          if(m&&action==='rating')m.rating=Number(value);
        }
        return route.fulfill({json:id});
      }
      if (path.endsWith('/profile')) {
        if(request.method()==='PATCH')Object.assign(state.profile,body);
        const single=request.headers().accept?.includes('object');
        return route.fulfill({json:single?state.profile:[state.profile]});
      }
      if (path.endsWith('/club')) return route.fulfill({json:state.groups.filter(g=>g.name.toLowerCase().includes((url.searchParams.get('name')??'').replace('ilike.','').replaceAll('%','').toLowerCase()))});
      const filter = <T extends object>(rows: T[]) => rows.filter(row=>[...url.searchParams].every(([k,v])=> !v.startsWith('eq.') || !(k in row) || String(row[k as keyof T])===v.slice(3)));
      const respond = (rows: object[]) => route.fulfill({json:request.headers().accept?.includes('object') ? rows[0]??null : rows});
      if (path.endsWith('/group_membership')) return respond(filter(state.memberships).map(m=>({...m,club:state.groups.find(g=>g.id===m.club_id)})));
      if (path.endsWith('/match')) {
        if(request.method()==='POST') {const match={...body,id:'new-match'};state.matches.push(match);return route.fulfill({json:match});}
        return respond(filter(state.matches));
      }
      if (path.endsWith('/signup')) return respond(filter(state.signups));
      if (path.endsWith('/team')||path.endsWith('/team_assignment')||path.endsWith('/chat_message'))return route.fulfill({json:[]});
      return route.fulfill({status:400,json:{message:`Unexpected mock request: ${path}`}});
    });
    await fixtureUse(state);
  },
});
export { expect };
export async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(user.email);
  await page.getByPlaceholder('Your password').fill('password123');
  await page.getByText('Sign In',{exact:true}).click();
  await expect(page).toHaveURL(/matches/);
}
