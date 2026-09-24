import { test, expect, login } from './fixtures';
test('match deep link works after login and refresh',async({page,backend})=>{
 expect(backend).toBeTruthy();await login(page);await page.goto('/match/match1');await expect(page.getByText('Confirmed Players')).toBeVisible();await page.reload();await expect(page.getByText('No players joined yet')).toBeVisible();
});
test('chat requires participation even for a group member',async({page,backend})=>{
 backend.memberships[0].role='member';await login(page);await page.goto('/match/match1/chat');await expect(page.getByText("Chat is for confirmed players",{exact:true})).toBeVisible();
});
