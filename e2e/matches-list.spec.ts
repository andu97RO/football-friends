import { test, expect, login } from './fixtures';

test('G1 M2 M3 M4 M10: one feed labelled by group, calm times, venue and no filter chips', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  const card = page.getByTestId('match-card-match1');
  await expect(card.getByText('Thursday 6-a-side')).toBeVisible();
  await expect(card.getByText('4', { exact: true })).toBeVisible();
  await expect(card.getByText('spots left', { exact: true })).toBeVisible();
  await expect(card.getByText(/in 2 days/)).toBeVisible();
  await expect(card.getByText('Arena Sport, pitch 2')).toBeVisible();
  await expect(card.getByText('+10')).toBeVisible();
  await expect(page.getByText('All matches')).toHaveCount(0);
  await expect(page.getByText(/\d+d \d\d:\d\d:\d\d/)).toHaveCount(0);
  await expect(page.getByTestId('match-row-match3').getByText('Team A 5–3 Team B')).toBeVisible();
  await expect(page.getByTestId('match-row-match3').getByText(/Man of the Match: Vlad Pop/)).toBeVisible();
});

test('M5: Join match joins in one tap and can be undone', async ({ page, backend }) => {
  await login(page);
  await page.getByTestId('join-match1').click();
  await expect(page.getByTestId('toast')).toContainText("You're in");
  await page.getByTestId('toast-action').click();
  await expect.poll(() => backend.requests.some((r) => r.path.endsWith('/cancel-signup'))).toBe(true);
  expect(backend.requests.some((r) => r.path.endsWith('/join-match'))).toBe(true);
});

test('M7: every tab is labelled', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  for (const label of ['Matches', 'Groups', 'Profile']) await expect(page.getByRole('tab', { name: label })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Admin' })).toHaveCount(0);
});

test('M8: a player with no group is offered an invite code first', async ({ page, backend }) => {
  backend.memberships = [];
  await login(page);
  await expect(page.getByTestId('matches-no-group')).toBeVisible();
  await page.getByTestId('empty-join-code').click();
  await page.getByTestId('invite-code-input').fill('https://footyfriends.app/join/ab12cd34');
  await expect(page.getByText('Thursday 6-a-side')).toBeVisible();
  await page.getByTestId('join-code-button').click();
  await expect.poll(() => backend.memberships.some((m) => m.club_id === 'club1' && m.status === 'approved')).toBe(true);
});
