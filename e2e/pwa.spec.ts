import { test, expect } from './fixtures';

// Every other spec blocks service workers so pages are never served from a cache; this one needs the real thing.
test.use({ serviceWorkers: 'allow' });

test('the app is installable: manifest, icons and an active service worker', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Football Friends', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated');
});

test('the app opens offline after one visit', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline emulation together with service workers is only reliable in Chromium');
  await page.goto('/');
  await expect(page.getByTestId('login-screen')).toBeVisible();
  // The page tells the worker which bundle files it loaded, since they arrived before the worker took control.
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('static-v1')).keys()).length > 0)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('login-screen')).toBeVisible();
});
