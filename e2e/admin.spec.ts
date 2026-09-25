import { test, expect, login } from './fixtures';
test('group owner creates a match in the selected group',async({page,backend})=>{
 await login(page);await page.goto('/admin');await page.getByText('Create Match',{exact:true}).last().click();await expect(page.getByText('Match Created!')).toBeVisible();expect(backend.requests.find(r=>r.path.endsWith('/match'))?.body.club_id).toBe('club1');
});
test('member cannot open admin tools',async({page,backend})=>{
 backend.memberships[0].role='member';await login(page);await page.goto('/admin');await expect(page.getByText("You don't have admin access")).toBeVisible();
});
