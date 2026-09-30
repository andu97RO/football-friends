import { test, expect, login } from './fixtures';

test('M9 M11 M12 M13 M14: detail answers when, where, who and how much', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/match/match1');
  await expect(page.getByText('3 teams of 6')).toBeVisible();
  await expect(page.getByText('25 RON each')).toBeVisible();
  await expect(page.getByTestId('squad-grid').getByText('Mihai')).toBeVisible();
  await expect(page.getByTestId('open-chat')).toContainText('Match chat');
  await expect(page.getByTestId('open-teams')).toContainText(/Teams at \d\d:\d\d/);
  await page.reload();
  await expect(page.getByTestId('join-match-button')).toContainText('Join match');
});

test('M15: a full match offers the waitlist to someone not on it', async ({ page, backend }) => {
  backend.matches[0].spots = 14;
  await login(page);
  await page.goto('/match/match1');
  await expect(page.getByTestId('join-match-button')).toContainText('Join waitlist');
});

test('M18 M19: leaving is quiet and uses paired verbs', async ({ page, backend }) => {
  backend.signups.push({ id: 999, match_id: 'match1', user_id: 'user123', state: 'confirmed', queue_pos: null, paid: false, attended: null, created_at: new Date().toISOString() });
  await login(page);
  await page.goto('/match/match1');
  await expect(page.getByTestId('my-status')).toContainText("You're in");
  await expect(page.getByText("You haven't paid yet")).toBeVisible();
  await page.getByTestId('leave-match-button').click();
  await expect(page.getByTestId('alert-title')).toHaveText('Leave match?');
  await expect(page.getByTestId('alert-message')).toContainText('spot 15');
  await expect(page.getByTestId('alert-button-keep-my-spot')).toBeVisible();
  await page.getByTestId('alert-button-leave-match').click();
  await expect.poll(() => backend.requests.some((r) => r.path.endsWith('/cancel-signup'))).toBe(true);
});

test('M16 M20 M21: organiser tools sit behind the menu; delete is confirmed', async ({ page, backend }) => {
  await login(page);
  await page.goto('/match/match1');
  await page.getByTestId('organiser-menu').click();
  await page.getByTestId('organiser-edit').click();
  await expect(page.getByTestId('edit-match-sheet')).toBeVisible();
  await expect(page.getByText('Delete this match')).toHaveCount(0);
  // Let the sheet finish sliding in; WebKit drops input typed into a moving field.
  await page.waitForTimeout(500);
  await page.getByTestId('venue-input').fill('Pitch 5');
  await page.getByTestId('save-match').click();
  await expect.poll(() => backend.matches[0].venue_name).toBe('Pitch 5');
  await page.getByTestId('organiser-menu').click();
  await page.getByTestId('organiser-delete').click();
  await expect(page.getByTestId('alert-title')).toHaveText('Delete this match?');
  await page.getByTestId('alert-button-delete-match').click();
  await expect(page).toHaveURL(/matches/);
});

test('M6: after the match players see the result and vote', async ({ page, backend }) => {
  await login(page);
  await page.goto('/match/match3');
  await expect(page.getByTestId('result-card')).toContainText('Man of the Match: Vlad Pop');
  await page.getByTestId('vote-motm').click();
  await page.getByTestId('vote-sheet').getByText('Radu Stan').click();
  await expect.poll(() => backend.votes[0]?.target).toBe('p3');
});

test('M6: organisers record score and attendance', async ({ page, backend }) => {
  await login(page);
  await page.goto('/match/match3/result');
  await page.getByRole('button', { name: 'More Team A' }).click();
  await page.getByRole('switch', { name: 'Radu Stan' }).click();
  await page.getByTestId('save-result').click();
  await expect.poll(() => backend.requests.some((r) => r.path.endsWith('/record_result'))).toBe(true);
  const saved = backend.requests.find((r) => r.path.endsWith('/record_result'))!.body;
  expect(saved.scores).toEqual({ teamA: 6, teamB: 3 });
  expect(saved.absent).toEqual(['p3']);
});

test('T6: chat has timestamps, a send button and no "You" labels', async ({ page, backend }) => {
  await login(page);
  await page.goto('/match/match1/chat');
  await expect(page.getByText('I have them, bringing both sets.')).toBeVisible();
  await expect(page.getByText('You', { exact: true })).toHaveCount(0);
  await page.getByTestId('chat-input').fill('See you at 19:50');
  await page.getByTestId('chat-send').click();
  await expect.poll(() => backend.requests.some((r) => r.path.endsWith('/notify-chat'))).toBe(true);
});

test('chat denies users outside the group', async ({ page, backend }) => {
  backend.memberships = backend.memberships.filter((m) => m.user_id !== 'user123');
  await login(page);
  await page.goto('/match/match1/chat');
  await expect(page.getByText('Chat is for group members', { exact: true })).toBeVisible();
});
