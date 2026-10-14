import { test, expect, login } from './fixtures';

test('T1 T3 T4 T5: fairness is a sentence, swaps keep sizes and can be undone', async ({ page, backend }) => {
  backend.matches[2].status = 'locked';
  await login(page);
  await page.goto('/teams/match3');
  await expect(page.getByTestId('balance')).toContainText(/between the strongest and weakest team|teams within/);
  await page.getByTestId('edit-teams').click();
  await page.getByRole('button', { name: 'Swap Vlad Pop' }).click();
  await expect(page.getByTestId('swap-sheet')).toContainText('Now playing for Team A');
  await page.getByTestId('swap-p1').click();
  await expect.poll(() => backend.assignments.find((a) => a.user_id === 'p2')?.team_id).toBe('teamB');
  await page.getByTestId('teams-undo').click();
  await expect.poll(() => backend.assignments.find((a) => a.user_id === 'p2')?.team_id).toBe('teamA');
});

test('M17: players see team averages, not individual ratings', async ({ page, backend }) => {
  backend.memberships[0].role = 'member';
  await login(page);
  await page.goto('/teams/match3');
  await expect(page.getByTestId('team-0')).toContainText('avg');
  await expect(page.getByTestId('team-0').getByText('4', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('edit-teams')).toHaveCount(0);
});
