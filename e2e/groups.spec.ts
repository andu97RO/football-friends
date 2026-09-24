import { test, expect, login } from './fixtures';
test('creates a group and switches without leaking the previous matches',async({page,backend})=>{
 await login(page);await page.goto('/groups');await page.getByLabel('Group name',{exact:true}).fill('New group');await page.getByLabel('Group description').fill('Friendly football');await page.getByRole('button',{name:'Create group',exact:true}).click();await expect(page.getByText('New group · Selected')).toBeVisible();await page.getByRole('button',{name:'View matches',exact:true}).last().click();await expect(page.getByText('No upcoming matches')).toBeVisible();expect(backend.memberships.at(-1)?.role).toBe('owner');
});
test('owner approves requests and appoints admins',async({page,backend})=>{
 backend.memberships.push({club_id:'club1',user_id:'applicant',role:'member',status:'pending',rating:2,created_at:'2026-01-01'});
 await login(page);await page.goto('/groups');await page.getByRole('button',{name:'Approve',exact:true}).click();await expect(page.getByRole('button',{name:'Promote to admin',exact:true})).toBeVisible();await page.getByRole('button',{name:'Promote to admin',exact:true}).click();await expect(page.getByRole('button',{name:'Demote to member',exact:true})).toBeVisible();expect(backend.memberships[1].role).toBe('admin');
});
