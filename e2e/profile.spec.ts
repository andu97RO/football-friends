import { test, expect, login } from './fixtures';
test('profile displays zero group rating and lets user edit only display fields',async({page,backend})=>{
 await login(page);await page.goto('/profile');await expect(page.getByText('Test Player',{exact:true})).toBeVisible();await page.getByText('Edit Profile',{exact:true}).click();await page.getByPlaceholder('Enter your name').fill('Updated Name');await page.getByText('Save',{exact:true}).click();await expect(page.getByText('Updated Name',{exact:true})).toBeVisible();const update=backend.requests.find(r=>r.path.endsWith('/profile'));expect(update?.body).not.toHaveProperty('rating_base');
});
test('logout clears protected routes',async({page,backend})=>{
 expect(backend).toBeTruthy();await login(page);await page.goto('/profile');await page.getByText('Sign Out',{exact:true}).click();await page.getByTestId('alert-button-sign-out').click();await expect(page).toHaveURL(/login/);await page.goto('/matches');await expect(page).toHaveURL(/login/);
});
