import { test, expect } from '@playwright/test';

test.describe('Profile', () => {
  const mockProfile = {
    id: '123',
    user_id: 'user123',
    display_name: 'Test Player',
    rating_base: 5,
    avatar_url: 'https://example.com/avatar.jpg',
    created_at: new Date().toISOString(),
  };

  test.beforeEach(async ({ page }) => {
    // Mock Supabase session (handled by app logic usually, but we can simulate logged in state or just mock the profile request if the page loads it)
    // In this app, we likely need to be logged in to access /profile.
    // We can simulate the auth state by mocking the session or by logging in first.
    // For speed, let's try to mock the session check if possible, or just go through login flow quickly if needed.
    // However, the app checks session on load.
    
    // Let's mock the session persistence or just mock the auth requests to return a session immediately.
    // Actually, the easiest way in E2E is to just mock the network requests that the Profile page makes, 
    // assuming the router allows access.
    // But the root layout might redirect if no session.
    
    // Let's mock the auth state by injecting it or mocking the supabase client response.
    // Since we can't easily inject into the running app code from Playwright without exposing it,
    // we might need to go through login or set local storage.
    // Supabase uses AsyncStorage/Local Storage.
    
    // Let's try to just go to the page and mock the redirects/auth checks.
    // If the app checks `supabase.auth.getSession()`, it makes a network request to `auth/v1/session` or similar if checking server,
    // but usually it checks local storage first.
    
    // Strategy: Mock the login flow quickly in beforeEach, or set up state.
    // Let's do a quick login mock.
    
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
    
    await page.route('**/rest/v1/profile*', async (route) => {
      if (route.request().method() === 'GET') {
          await route.fulfill({ json: mockProfile });
      } else if (route.request().method() === 'POST' || route.request().method() === 'PATCH') {
          // Mock update
          const postData = route.request().postDataJSON();
          await route.fulfill({ json: { ...mockProfile, ...postData } });
      } else {
          await route.continue();
      }
    });

    // Go to login and login first to set session
    await page.goto('/(auth)/login');
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Your password').fill('password');
    
    // Mock matches for the redirect
    await page.route('**/rest/v1/match*', async (route) => {
        await route.fulfill({ json: [] });
    });
    
    await page.getByText('Sign In').click();
    await expect(page).toHaveURL(/.*matches/);
    
    // Now navigate to profile
    await page.goto('/(tabs)/profile');
  });

  test('should view profile details', async ({ page }) => {
    await expect(page.getByText('Test Player')).toBeVisible();
    await expect(page.getByText('test@example.com')).toBeVisible();
    await expect(page.getByText('5')).toBeVisible(); // Rating
  });

  test('should edit profile name', async ({ page }) => {
    await page.getByText('Edit Profile').click();
    
    await expect(page.getByText('Edit Profile', { exact: true })).toBeVisible(); // Modal title
    
    const nameInput = page.getByPlaceholder('Enter your name');
    await nameInput.fill('Updated Name');
    
    await page.getByText('Save').click();
    
    // Should close modal and show success?
    // The app shows Alert.alert('Success', ...)
    // We can check if the modal is closed or if the name is updated in the UI (if we mocked the refetch)
    
    // We mocked the PATCH request to return the updated profile, 
    // but we also need to mock the GET request again if it refetches.
    // The `useQuery` might refetch.
    
    // Let's update the mock for the next GET
    await page.route('**/rest/v1/profile*', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ json: { ...mockProfile, display_name: 'Updated Name' } });
        } else {
            await route.fulfill({ json: { ...mockProfile, display_name: 'Updated Name' } });
        }
    });
    
    // Verify the new name is visible on the profile page
    // We might need to wait for the modal to close
    await expect(page.getByText('Updated Name')).toBeVisible();
  });

  test('should sign out', async ({ page }) => {
    // Mock signOut request
    await page.route('**/auth/v1/logout', async (route) => {
      await route.fulfill({ status: 200, body: '{}' });
    });

    // Handle confirm dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.getByText('Sign Out').click();
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });
});
