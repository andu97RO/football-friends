import { test, expect, login, user } from './fixtures';

function recoveryUrl() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from('test-signature').toString('base64url')}`;
  return `/callback?type=recovery#${new URLSearchParams({ access_token: token, refresh_token: 'recovery-refresh-token', token_type: 'bearer', expires_in: '3600', type: 'recovery' })}`;
}

test('emailed recovery link saves the new password and opens matches', async ({ page, backend }) => {
  await page.goto(recoveryUrl());
  await expect(page.getByTestId('reset-password-screen')).toBeVisible();
  await page.getByTestId('new-password-input').fill('new-password123');
  await page.getByTestId('update-password-button').click();
  await expect(page.getByTestId('matches-screen')).toBeVisible();
  expect(backend.requests.filter((r) => r.path.endsWith('/user') && r.body.password)).toEqual([
    expect.objectContaining({ path: '/auth/v1/user', body: expect.objectContaining({ password: 'new-password123' }) }),
  ]);
});

test('a busy session stops the reset spinner and can be retried safely', async ({ page, backend }) => {
  await page.goto(recoveryUrl());
  await expect(page.getByTestId('reset-password-screen')).toBeVisible();
  // Model another tab holding Supabase's cross-tab session lock.
  await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((name) => name.endsWith('-auth-token'))!;
    await new Promise<void>((held) => {
      void navigator.locks.request(`lock:${key}`, () => new Promise<void>((release) => {
        (window as any).releaseAuthLock = release;
        held();
      }));
    });
  });
  await page.getByTestId('new-password-input').fill('new-password123');
  await page.getByTestId('update-password-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Another tab is busy' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('update-password-button')).toBeEnabled();
  expect(backend.requests.filter((r) => r.body.password)).toHaveLength(0);
  await page.evaluate(() => (window as any).releaseAuthLock());
  await page.getByTestId('update-password-button').click();
  await expect(page.getByTestId('matches-screen')).toBeVisible();
  expect(backend.requests.filter((r) => r.body.password)).toHaveLength(1);
});

test('password update errors stop the spinner and allow a corrected password', async ({ page, backend }) => {
  await page.goto(recoveryUrl());
  await expect(page.getByTestId('reset-password-screen')).toBeVisible();
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    await route.fulfill({ status: 422, json: { code: 'same_password', msg: 'New password should be different from the old password.' } });
  });
  await page.getByTestId('new-password-input').fill('password123');
  await page.getByTestId('update-password-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'New password should be different' })).toBeVisible();
  await expect(page.getByTestId('update-password-button')).toBeEnabled();
  await page.unroute('**/auth/v1/user');
  await page.getByTestId('new-password-input').fill('new-password123');
  await page.getByTestId('update-password-button').click();
  await expect(page.getByTestId('matches-screen')).toBeVisible();
  expect(backend.requests.some((r) => r.body.password === 'new-password123')).toBe(true);
});

test('password login and hard refresh preserve session', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.reload();
  await expect(page).toHaveURL(/matches/);
  await expect(page.getByTestId('matches-screen')).toBeVisible();
});

test('A1: sign-in offers Google and an emailed code while Apple is hidden', async ({ page, backend }) => {
  await page.goto('/login');
  await expect(page.getByTestId('google-sign-in')).toBeVisible();
  await expect(page.getByTestId('apple-sign-in')).toHaveCount(0);
  await page.getByTestId('email-input').fill('player@example.com');
  await page.getByTestId('email-code-button').click();
  await expect(page.getByTestId('check-inbox-screen')).toBeVisible();
  await expect(page.getByText(/sign-in code to player@example.com/)).toBeVisible();
  expect(backend.requests.find((r) => r.path.endsWith('/otp'))?.body).toMatchObject({ email: 'player@example.com', create_user: true });
  await expect(page.getByTestId('resend-email')).toBeDisabled();
  await page.getByTestId('email-code-input').fill('123456');
  await page.getByTestId('verify-code-button').click();
  await expect(page.getByTestId('matches-screen')).toBeVisible();
  expect(backend.requests.find((r) => r.path.endsWith('/verify'))?.body).toMatchObject({ email: 'player@example.com', token: '123456', type: 'email' });
});

test('A3 A4 A5: sign-up asks for a name, one password and a described rating', async ({ page, backend }) => {
  await page.goto('/sign-up');
  await expect(page.getByTestId('google-sign-in')).toBeVisible();
  await expect(page.getByTestId('apple-sign-in')).toHaveCount(0);
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

test('email OTP creates a missing profile and sends a new player through onboarding and the saved invite', async ({ page, backend }) => {
  backend.profiles = backend.profiles.filter((p) => p.user_id !== user.id);
  backend.memberships = backend.memberships.filter((m) => m.user_id !== user.id);
  await page.goto('/join/AB12CD34');
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await page.getByTestId('email-input').fill('new@example.com');
  await page.getByTestId('email-code-button').click();
  await page.getByTestId('email-code-input').fill('123456');
  await page.getByTestId('verify-code-button').click();
  await expect(page.getByTestId('onboarding-screen')).toBeVisible();
  expect(backend.requests.some((r) => r.path.endsWith('/initialize_profile'))).toBe(true);
  await page.getByTestId('name-input').fill('New player');
  await page.getByTestId('rating-3').click();
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByTestId('join-screen')).toBeVisible();
  await page.getByTestId('accept-invite').click();
  await expect(page.getByTestId('matches-screen')).toBeVisible();
  expect(backend.memberships.some((m) => m.user_id === user.id && m.club_id === 'club1')).toBe(true);
});

test('invalid or expired email codes keep the form available for retry', async ({ page, backend }) => {
  await page.route('**/auth/v1/verify', (route) => route.fulfill({ status: 403, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'X-Supabase-Api-Version' }, json: { code: 'otp_expired', msg: 'Token has expired or is invalid' } }));
  await page.goto('/check-inbox?kind=otp&email=player%40example.com');
  await page.getByTestId('email-code-input').fill('12');
  await page.getByTestId('verify-code-button').click();
  await expect(page.getByTestId('auth-error')).toContainText('6–10 digit');
  expect(backend.requests.filter((r) => r.path.endsWith('/verify'))).toHaveLength(0);
  await page.getByTestId('email-code-input').fill('123456');
  await page.getByTestId('verify-code-button').click();
  await expect(page.getByTestId('auth-error')).toContainText('invalid or has expired');
  await expect(page.getByTestId('verify-code-button')).toBeEnabled();
  await page.unroute('**/auth/v1/verify');
  await page.getByTestId('email-code-input').fill('654321');
  await page.getByTestId('verify-code-button').click();
  await expect(page.getByTestId('matches-screen')).toBeVisible();
});

test('email quota errors suggest Google without opening the code screen', async ({ page }) => {
  await page.route('**/auth/v1/otp*', (route) => route.fulfill({ status: 429, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'X-Supabase-Api-Version' }, json: { code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' } }));
  await page.goto('/login');
  await page.getByTestId('email-input').fill('player@example.com');
  await page.getByTestId('email-code-button').click();
  await expect(page.getByTestId('auth-error')).toContainText('Try Google sign-in');
  await expect(page.getByTestId('email-code-button')).toBeEnabled();
});

test('email codes can be resent after the cooldown with account creation enabled', async ({ page, backend }) => {
  await page.clock.install();
  await page.goto('/check-inbox?kind=otp&email=new%40example.com');
  await expect(page.getByTestId('resend-email')).toBeDisabled();
  await page.clock.fastForward(61_000);
  await page.getByTestId('resend-email').click();
  expect(backend.requests.find((r) => r.path.endsWith('/otp'))?.body).toMatchObject({ email: 'new@example.com', create_user: true });
  await expect(page.getByTestId('resend-email')).toBeDisabled();
});
