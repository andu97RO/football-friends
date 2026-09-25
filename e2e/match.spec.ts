import { test, expect, login } from './fixtures';
test('match deep link works after login and refresh',async({page,backend})=>{
 expect(backend).toBeTruthy();await login(page);await page.goto('/match/match1');await expect(page.getByText('Confirmed Players')).toBeVisible();await page.reload();await expect(page.getByText('No players joined yet')).toBeVisible();
});
test('group members can chat while a match is waiting',async({page,backend})=>{
 backend.matches[0].signup_open_at=new Date(Date.now()+3600000).toISOString();
 backend.memberships[0].role='member';
 await login(page);await page.goto('/match/match1');
 await page.getByText('Match Chat',{exact:true}).click();
 await expect(page.getByText('No messages yet. Say hi!')).toBeVisible();
});
test('group members can reach chat after kickoff',async({page,backend})=>{
 backend.matches[0].kick_off=new Date(Date.now()-3600000).toISOString();
 backend.matches[0].signup_open_at=new Date(Date.now()-86400000).toISOString();
 await login(page);await expect(page.getByText('Past Matches')).toBeVisible();
 await page.getByText('Started',{exact:true}).click();
 await page.getByText('Match Chat',{exact:true}).click();
 await expect(page.getByText('No messages yet. Say hi!')).toBeVisible();
});
test('chat denies users outside the group',async({page,backend})=>{
 backend.memberships=[];await login(page);await page.goto('/match/match1/chat');await expect(page.getByText('Chat is for group members',{exact:true})).toBeVisible();
});
