import { test, expect, login } from './fixtures';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

test.describe('on iOS, where Safari has no install prompt', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('the home screen steps show once and stay dismissed', async ({ page, backend }) => {
    expect(backend).toBeTruthy();
    await login(page);
    await expect(page.getByTestId('install-hint')).toContainText('Add to Home Screen');
    await expect(page.getByTestId('install-app')).toHaveCount(0);
    await page.getByTestId('install-dismiss').click();
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('matches-screen')).toBeVisible();
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
  });
});

test('where the browser offers an install prompt, the button opens it', async ({ page, backend, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium fires beforeinstallprompt');
  expect(backend).toBeTruthy();
  await login(page);
  await expect(page.getByTestId('matches-screen')).toBeVisible();
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    event.prompt = async () => {
      (window as unknown as { installPromptShown: boolean }).installPromptShown = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.getByTestId('install-app').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { installPromptShown?: boolean }).installPromptShown)).toBe(true);
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
});
