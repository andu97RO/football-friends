import { test, expect, login } from './fixtures';

test('D1 D2 D3 D6: "+" on Matches opens New match; the confirmation says what happens', async ({ page, backend }) => {
  await login(page);
  await page.getByTestId('new-match-button').click();
  await expect(page.getByTestId('new-match-screen')).toBeVisible();
  await expect(page.getByTestId('repeat-weekly')).toBeVisible();
  await page.getByTestId('venue-input').fill('Arena Sport, pitch 1');
  await page.getByTestId('fee-input').fill('30');
  await page.getByTestId('create-match-button').click();
  await expect(page).toHaveURL(/match\/new-match/);
  await expect(page.getByTestId('toast')).toContainText('everyone in Thursday 6-a-side gets a notification');
  const body = backend.requests.find((r) => r.path.endsWith('/create-match'))!.body;
  expect(body).toMatchObject({ clubId: 'club1', venue_name: 'Arena Sport, pitch 1', fee_amount: 30, spots: 18, teams_count: 3 });
});

test('members do not get the New match button', async ({ page, backend }) => {
  backend.memberships[0].role = 'member';
  await login(page);
  await expect(page.getByTestId('new-match-button')).toHaveCount(0);
});
