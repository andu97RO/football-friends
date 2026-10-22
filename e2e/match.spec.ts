import { test, expect, login } from './fixtures';

test('M9 M11 M12 M13 M14: detail answers when, where, who and how much', async ({ page, backend }) => {
  expect(backend).toBeTruthy();
  await login(page);
  await page.goto('/match/match1');
  await expect(page.getByText('3 teams of 6')).toBeVisible();
  await expect(page.getByText('25 RON each')).toBeVisible();
  await expect(page.getByTestId('squad-grid').getByText('Mihai Ionescu')).toBeVisible();
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


test.describe('on a device outside the app time zone', () => {
  // Pickers must use Bucharest time like the rest of the app, not the device's zone.
  test.use({ timezoneId: 'America/New_York' });

  test('match dates stay editable after saving and reopening the sheet', async ({ page, backend }) => {
    await login(page);
    await page.goto('/match/match1');
    const sheet = page.getByTestId('edit-match-sheet');
    // Pick a time from each row's web picker; the second opening once hid the picker behind the sheet.
    const pickTime = async (row: string, time: string) => {
      const input = sheet.getByTestId(row).locator('div[style*="cursor"]').nth(1);
      await input.click();
      await page.locator('.react-datepicker-popper .react-datepicker__time-list-item', { hasText: time }).click();
      await expect(page.locator('.react-datepicker-popper')).toHaveCount(0);
      await expect(input).toHaveText(time);
    };
    // Saved instants read as Bucharest wall clock, the zone the app shows times in.
    const wallTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
    for (const [kickOff, signup] of [['20:30', '08:00'], ['21:00', '09:00']]) {
      await page.getByTestId('organiser-menu').click();
      await page.getByTestId('organiser-edit').click();
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(500);
      await sheet.getByTestId('kickoff-row').locator('div[style*="cursor"]').first().click();
      await page.locator('.react-datepicker__day:not(.react-datepicker__day--disabled):not(.react-datepicker__day--outside-month):not(.react-datepicker__day--selected)').last().click();
      await expect(page.locator('.react-datepicker-popper')).toHaveCount(0);
      await pickTime('kickoff-row', kickOff);
      await pickTime('signup-row', signup);
      await page.getByTestId('save-match').click();
      await expect(sheet).toHaveCount(0);
      expect(wallTime(backend.matches[0].kick_off)).toBe(kickOff);
      expect(wallTime(backend.matches[0].signup_open_at)).toBe(signup);
    }
  });
});

test('locked match editing keeps the drawn format fixed', async ({ page, backend }) => {
  backend.matches[0].status = 'locked';
  await login(page);
  await page.goto('/match/match1');
  await page.getByTestId('organiser-menu').click();
  await page.getByTestId('organiser-edit').click();
  const sheet = page.getByTestId('edit-match-sheet');
  await expect(sheet.getByText('The format is fixed once teams have been drawn.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'More Teams', exact: true })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: 'More Spots', exact: true })).toBeDisabled();
});

test('reopening a result preserves the saved score and attendance', async ({ page, backend }) => {
  await login(page);
  await page.goto('/match/match3');
  const openResult = async () => {
    await page.getByTestId('organiser-menu').click();
    await page.getByTestId('organiser-result').click();
    await expect(page.getByTestId('record-result-screen')).toBeVisible();
  };
  await openResult();
  await page.getByRole('button', { name: 'More Team A' }).click();
  await page.getByRole('switch', { name: 'Radu Stan' }).click();
  await page.getByTestId('save-result').click();
  await expect(page.getByTestId('result-card')).toBeVisible();
  await openResult();
  await page.getByRole('button', { name: 'More Team B' }).click();
  await page.getByTestId('save-result').click();
  await expect.poll(() => backend.requests.filter((r) => r.path.endsWith('/record_result')).length).toBe(2);
  const saved = backend.requests.filter((r) => r.path.endsWith('/record_result'))[1].body;
  expect(saved.scores).toEqual({ teamA: 6, teamB: 4 });
  expect(saved.absent).toEqual(['p3']);
});
