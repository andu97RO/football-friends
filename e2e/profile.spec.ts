import { test, expect, login } from './fixtures';

test('P1 P2 P5: one rating format, edit profile without a phantom "Remove photo"', async ({ page, backend }) => {
  await login(page);
  await page.goto('/profile');
  await expect(page.getByTestId('rating-card')).toContainText('4/5');
  await expect(page.getByText('+0.2 over the last 5 games')).toHaveCount(0);
  await page.getByTestId('edit-profile').click();
  await expect(page.getByText('Remove photo')).toHaveCount(0);
  await page.getByTestId('display-name-input').fill('Updated Name');
  await page.getByTestId('save-profile').click();
  await expect(page.getByText('Updated Name', { exact: true })).toBeVisible();
  expect(backend.requests.find((r) => r.path.endsWith('/profile') && 'display_name' in r.body)?.body).not.toHaveProperty('rating_base');
});

test('P3: separate notification switches with plain names', async ({ page, backend }) => {
  await login(page);
  await page.goto('/profile');
  await expect(page.getByText('Waitlist spot')).toBeVisible();
  await expect(page.getByText('Promotions')).toHaveCount(0);
  await expect(page.getByText('Send a test notification')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Match chat' }).click();
  await expect.poll(() => backend.profiles[0].notify_chat).toBe(false);
});

test('P6: changing the password needs the current one', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/profile');
  await page.getByTestId('change-password').click();
  await page.getByTestId('new-password').fill('newpassword1');
  await page.getByTestId('update-password').click();
  await expect(page.getByText('Enter your current password.')).toBeVisible();
});

test('P4: accounts can be deleted in the app', async ({ page, backend }) => {
  await login(page);
  await page.goto('/profile');
  await page.getByTestId('delete-account').click();
  await expect(page.getByTestId('alert-title')).toHaveText('Delete your account?');
  await page.getByTestId('alert-button-delete-account').click();
  await expect.poll(() => backend.requests.some((r) => r.path.endsWith('/delete-account'))).toBe(true);
  await expect(page).toHaveURL(/login/);
});

test('language: Romanian is one tap away', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Română' }).click();
  await expect(page.getByRole('tab', { name: 'Meciuri' })).toBeVisible();
  await page.goto('/matches');
  await expect(page.getByText('locuri libere', { exact: true })).toBeVisible();
  await expect(page.getByText('Echipa A 5–3 Echipa B')).toBeVisible();
});

test('logout clears protected routes', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/profile');
  await page.getByTestId('sign-out').click();
  await page.getByTestId('alert-button-sign-out').click();
  await expect(page).toHaveURL(/login/);
  await page.goto('/matches');
  await expect(page).toHaveURL(/login/);
});
