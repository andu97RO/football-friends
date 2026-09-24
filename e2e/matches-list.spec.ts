import { test, expect, login } from './fixtures';
test('lists upcoming matches and joins',async({page,backend})=>{
 await login(page);await expect(page.getByText('2 teams',{exact:true})).toBeVisible();await page.getByText('JOIN',{exact:true}).click();await expect.poll(()=>backend.requests.some(r=>r.path.endsWith('/join-match'))).toBe(true);
});
test('shows empty state',async({page,backend})=>{
 backend.matches=[];await login(page);await expect(page.getByText('No upcoming matches')).toBeVisible();
});
test('new users discover groups without receiving group access',async({page,backend})=>{
 backend.memberships=[];await login(page);await page.getByText('Find groups',{exact:true}).click();await expect(page.getByText('Join a group below or create your own.')).toBeVisible();await page.getByText('Request to join',{exact:true}).first().click();await expect(page.getByText('Request sent. An admin will review it.')).toBeVisible();expect(backend.memberships[0].status).toBe('pending');
});
