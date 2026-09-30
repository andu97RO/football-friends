import { test, expect, login } from './fixtures';

test('password login and hard refresh preserve session', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.reload();
  await expect(page).toHaveURL(/matches/);
  await expect(page.getByTestId('matches-screen')).toBeVisible();
});

test('A1: sign-in offers Apple, Google and an emailed link', async ({ page, backend }) => {
  await page.goto('/login');
  await expect(page.getByTestId('google-sign-in')).toBeVisible();
  await expect(page.getByTestId('apple-sign-in')).toBeVisible();
  await page.getByTestId('email-input').fill('player@example.com');
  await page.getByTestId('magic-link-button').click();
  await expect(page.getByTestId('check-inbox-screen')).toBeVisible();
  await expect(page.getByText(/sign-in link to player@example.com/)).toBeVisible();
  expect(backend.requests.some((r) => r.path.endsWith('/otp'))).toBe(true);
});

test('A3 A4 A5: sign-up asks for a name, one password and a described rating', async ({ page, backend }) => {
  await page.goto('/sign-up');
  await expect(page.getByPlaceholder('Confirm your password')).toHaveCount(0);
  await page.getByTestId('name-input').fill('Nick');
  await page.getByTestId('email-input').fill('new@example.com');
  await page.getByTestId('password-input').fill('short');
  await page.getByTestId('create-account-button').click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  await page.getByTestId('password-input').fill('password123');
  await page.getByTestId('create-account-button').click();
  await expect(page.getByText('Pick the skill level that fits you best.')).toBeVisible();
  await page.getByTestId('rating-3').click();
  await expect(page.getByText('3 · Regular, plays every week')).toBeVisible();
  await page.getByTestId('create-account-button').click();
  await expect(page.getByTestId('check-inbox-screen')).toBeVisible();
  expect(backend.requests.find((r) => r.path.endsWith('/signup'))?.body.data).toEqual({ display_name: 'Nick', initial_rating: 3 });
});

test('A6: forgot password asks for the email, then confirms', async ({ page, backend }) => {
  await page.goto('/login');
  await page.getByTestId('forgot-password').click();
  await page.getByTestId('forgot-password-screen').getByTestId('email-input').fill('player@example.com');
  await page.getByTestId('send-reset-button').click();
  await expect(page.getByText(/password reset link to player@example.com/)).toBeVisible();
  expect(backend.requests.some((r) => r.path.endsWith('/recover'))).toBe(true);
});

test('invalid credentials show an error', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await page.route('**/auth/v1/token*', (route) => route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }));
  await page.goto('/login');
  await page.getByTestId('email-input').fill('wrong@example.com');
  await page.getByTestId('password-input').fill('wrongpass');
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByText(/Invalid login credentials/i)).toBeVisible();
});

test('recovery callback routes an already consumed session to reset', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/callback?type=recovery');
  await expect(page).toHaveURL(/reset-password/);
  await expect(page.getByTestId('new-password-input')).toBeVisible();
});

test('A3: players without a name are onboarded once', async ({ page, backend }) => {
  backend.profiles[0].onboarded = false;
  await login(page).catch(() => undefined);
  await expect(page.getByTestId('onboarding-screen')).toBeVisible();
  await page.getByTestId('name-input').fill('Nick');
  await page.getByTestId('rating-2').click();
  await page.getByTestId('onboarding-continue').click();
  await expect(page).toHaveURL(/matches/);
  expect(backend.requests.find((r) => r.path.endsWith('/complete_onboarding'))?.body).toEqual({ name: 'Nick', rating: 2 });
});
