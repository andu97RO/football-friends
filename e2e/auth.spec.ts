import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/(auth)/login');
  });

  test('should login with password successfully', async ({ page }) => {
    // Mock Supabase signInWithPassword response
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'user123',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.com',
            app_metadata: { provider: 'email' },
            email_confirmed_at: '2025-01-01T00:00:00.000Z',
          },
        }),
      });
    });

    // Mock the matches request to avoid errors on the next page
    await page.route('**/rest/v1/match*', async (route) => {
      await route.fulfill({ json: [] });
    });

    // Fill credentials
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Your password').fill('password123');

    // Submit
    await page.getByText('Sign In').click();

    // Wait for navigation
    await expect(page).toHaveURL(/.*matches/);
  });

  test('should require email verification after signup (no auto-login)', async ({ page }) => {
    await page.goto('/(auth)/sign-up');

    await page.route('**/auth/v1/signup', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'new-user-1',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'new@example.com',
            app_metadata: { provider: 'email' },
            email_confirmed_at: null,
          },
        }),
      });
    });

    await page.getByPlaceholder('you@example.com').fill('new@example.com');
    await page.getByPlaceholder('Create a password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password123');

    await page.getByText('Sign Up').click();

    await expect(page.getByText('Account created! Please check your email for the confirmation link.')).toBeVisible();
    await expect(page).not.toHaveURL(/.*matches/);
  });

  test('should show error on invalid login', async ({ page }) => {
    // Mock Supabase error response
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      });
    });

    // Fill credentials
    await page.getByPlaceholder('you@example.com').fill('wrong@example.com');
    await page.getByPlaceholder('Your password').fill('wrongpass');

    // Submit
    await page.getByText('Sign In').click();

    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  });
});
