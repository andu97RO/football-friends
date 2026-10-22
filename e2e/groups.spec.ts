import { test, expect, login } from './fixtures';

test('G3: creating a group happens in a sheet', async ({ page, backend }) => {
  await login(page);
  await page.goto('/groups');
  await expect(page.getByTestId('group-name-input')).toHaveCount(0);
  await page.getByTestId('open-create-group').click();
  await page.getByTestId('group-name-input').fill('New group');
  await page.getByTestId('create-group-button').click();
  await expect(page).toHaveURL(/group\/created-group/);
  expect(backend.memberships.at(-1)?.role).toBe('owner');
});

test('G2: a request is "Pending" in one place and can be cancelled', async ({ page, backend }) => {
  await login(page);
  await page.goto('/groups');
  await page.getByTestId('group-search').fill('Tues');
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByTestId('group-club2')).toContainText('Pending');
  await page.getByTestId('group-club2').getByRole('button', { name: 'Cancel request' }).click();
  await page.getByTestId('alert-button-cancel-request').click();
  await expect.poll(() => backend.memberships.some((m) => m.club_id === 'club2')).toBe(false);
});

test('G4 G5 G6: requests badge, self-rating wording, rating editor with undo', async ({ page, backend }) => {
  backend.memberships.push({ club_id: 'club1', user_id: 'applicant', role: 'member', status: 'pending', rating: 3, self_rating: 3, created_at: new Date().toISOString() });
  await login(page);
  await expect(page.getByRole('tab', { name: 'Groups, 1' })).toBeVisible();
  await page.goto('/group/club1');
  await expect(page.getByTestId('request-applicant')).toContainText('Self-rated 3/5');
  await page.getByTestId('approve-applicant').click();
  await expect.poll(() => backend.memberships.find((m) => m.user_id === 'applicant')?.status).toBe('approved');
  await page.getByTestId('member-p2').click();
  await expect(page.getByTestId('member-sheet')).toContainText('Make admin');
  await page.getByTestId('member-sheet').getByTestId('rating-5').click();
  await page.getByTestId('save-rating').click();
  await expect.poll(() => backend.memberships.find((m) => m.user_id === 'p2')?.rating).toBe(5);
  await page.getByTestId('toast-action').click();
  await expect.poll(() => backend.memberships.find((m) => m.user_id === 'p2')?.rating).toBe(3);
});

test('M8: organisers see an invite link to share', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/group/club1');
  await expect(page.getByTestId('invite-code')).toHaveText('AB12CD34');
  await expect(page.getByTestId('share-invite')).toBeVisible();
});

test('M8: opening an invite link joins the group', async ({ page, backend }) => {
  backend.memberships = backend.memberships.filter((m) => m.user_id !== 'user123');
  await login(page);
  await page.goto('/join/TUE55555');
  await page.getByTestId('accept-invite').click();
  await expect(page).toHaveURL(/matches/);
  expect(backend.memberships.some((m) => m.club_id === 'club2' && m.status === 'approved')).toBe(true);
});

test('owners rename a group and edit its description', async ({ page, backend }) => {
  await login(page);
  await page.goto('/group/club1');
  await page.getByTestId('edit-group').click();
  await expect(page.getByTestId('edit-group-sheet')).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByTestId('edit-group-name').fill('Friday 7-a-side');
  await page.getByTestId('save-group').click();
  await expect.poll(() => backend.groups.find((g) => g.id === 'club1')?.name).toBe('Friday 7-a-side');
  expect(backend.groups.find((g) => g.id === 'club1')?.description).toBe('Every Thursday at Arena');
});

test('owners delete a group after confirming', async ({ page, backend }) => {
  await login(page);
  await page.goto('/group/club1');
  await page.getByTestId('delete-group').click();
  await expect(page.getByTestId('alert-title')).toHaveText('Delete Thursday 6-a-side?');
  await page.getByTestId('alert-button-delete-group').click();
  await expect(page).toHaveURL(/groups/);
  await expect.poll(() => backend.groups.some((g) => g.id === 'club1')).toBe(false);
});

test('members leave a group; only owners see edit and delete', async ({ page, backend }) => {
  backend.memberships.find((m) => m.club_id === 'club1' && m.user_id === 'user123')!.role = 'member';
  await login(page);
  await page.goto('/group/club1');
  await expect(page.getByTestId('edit-group')).toHaveCount(0);
  await expect(page.getByTestId('delete-group')).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave group' }).click();
  await page.getByTestId('alert-button-leave-group').click();
  await expect(page).toHaveURL(/groups/);
  expect(backend.memberships.some((m) => m.club_id === 'club1' && m.user_id === 'user123')).toBe(false);
});
