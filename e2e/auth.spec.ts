import { test, expect, login } from './fixtures';
test('password login and hard refresh preserve session',async({page,backend})=>{
  expect(backend).toBeTruthy(); await login(page); await page.reload(); await expect(page).toHaveURL(/matches/); await expect(page.getByText('Find groups',{exact:true})).toHaveCount(0);
});
test('signup asks for a rating and preserves zero stars',async({page,backend})=>{
  await page.goto('/sign-up');
  await page.getByPlaceholder('you@example.com').fill('new@example.com');
  await page.getByPlaceholder('Create a password').fill('password123');
  await page.getByPlaceholder('Confirm your password').fill('password123');
  await page.getByText('Sign Up',{exact:true}).click();
  await expect(page.getByText('Choose your starting rating from 0 to 5 stars')).toBeVisible();
  await page.getByRole('radio',{name:'0 stars',exact:true}).click();
  await page.getByText('Sign Up',{exact:true}).click();
  await expect(page.getByText(/Account created! Please check/)).toBeVisible();
  expect(backend.requests.find(r=>r.path.endsWith('/signup'))?.body.data).toEqual({initial_rating:0});
  await expect(page).toHaveURL(/sign-up/);
});
test('invalid credentials show an error',async({page,backend})=>{
  expect(backend).toBeTruthy();
  await page.route('**/auth/v1/token*',route=>route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Invalid login credentials'}}));
  await page.goto('/login');await page.getByPlaceholder('you@example.com').fill('wrong@example.com');await page.getByPlaceholder('Your password').fill('wrongpass');await page.getByText('Sign In',{exact:true}).click();await expect(page.getByText(/Invalid login credentials/i)).toBeVisible();
});
test('recovery callback routes an already consumed session to reset',async({page,backend})=>{
  expect(backend).toBeTruthy();await login(page);await page.goto('/callback?type=recovery');await expect(page).toHaveURL(/reset-password/);await expect(page.getByPlaceholder('Enter new password')).toBeVisible();
});
