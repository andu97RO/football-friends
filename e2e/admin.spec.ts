import { test, expect } from '@playwright/test';

test.describe('Admin - Create Match', () => {
  test.beforeEach(async ({ page }) => {
    // Mock login
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

    // Mock check organizer
    await page.route('**/rest/v1/club*', async (route) => {
      if (route.request().method() === 'GET') {
          await route.fulfill({ json: { id: 'club1', organizer_id: 'user123' } });
      } else {
          await route.continue();
      }
    });

    await page.goto('/(auth)/login');
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Your password').fill('password');
    
    // Mock matches for redirect
    await page.route('**/rest/v1/match*', async (route) => {
        if (route.request().method() === 'GET') {
             await route.fulfill({ json: [] });
        } else {
            await route.continue();
        }
    });

    await page.getByText('Sign In').click();
    await expect(page).toHaveURL(/.*matches/);
    
    // Navigate to Admin tab
    await page.goto('/(tabs)/admin');
  });

  test('should create a match successfully', async ({ page }) => {
    // Mock create match request
    await page.route('**/rest/v1/match', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        await route.fulfill({ 
            status: 201,
            json: { id: 'new-match-id', ...postData } 
        });
      } else {
          await route.continue();
      }
    });

    // Verify we are on the create match screen
    await expect(page.getByText('Create Match')).toBeVisible();

    // Fill details (using default dates for simplicity or interacting with inputs if needed)
    // The form has defaults. We can just click Create.
    
    await page.getByText('Create Match').click();
    
    // Verify success modal
    await expect(page.getByText('Match Created!')).toBeVisible();
    
    // Close modal
    await page.getByText('Awesome!').click();
    
    // Modal should close
    await expect(page.getByText('Match Created!')).not.toBeVisible();
  });
});
