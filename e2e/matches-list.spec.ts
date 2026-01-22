import { test, expect } from '@playwright/test';

test.describe('Matches List', () => {
  const mockMatches = [
    {
      id: '1',
      club_id: 'club1',
      kick_off: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      signup_open_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      spots: 10,
      teams_count: 2,
      status: 'open',
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      club_id: 'club1',
      kick_off: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      signup_open_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      spots: 10,
      teams_count: 2,
      status: 'scheduled', // or waiting
      created_at: new Date().toISOString(),
    }
  ];

  test.beforeEach(async ({ page }) => {
    // Mock login flow to get to matches page
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

    await page.goto('/(auth)/login');
    await page.getByPlaceholder('you@example.com').fill('test@example.com');
    await page.getByPlaceholder('Your password').fill('password');
  });

  test('should list upcoming matches', async ({ page }) => {
    // Mock matches response
    await page.route('**/rest/v1/match*', async (route) => {
      await route.fulfill({ json: mockMatches });
    });

    // Mock capacity RPC (confirmed + reserved counts)
    await page.route('**/rest/v1/rpc/get_match_capacity*', async (route) => {
      await route.fulfill({
        json: [
          { match_id: '1', confirmed_count: 0, reserved_count: 0 },
          { match_id: '2', confirmed_count: 0, reserved_count: 0 },
        ],
      });
    });

    // Mock user signups lookup (not joined)
    await page.route('**/rest/v1/signup*', async (route) => {
      await route.fulfill({ json: [] });
    });

    // Mock invitations lookup (none)
    await page.route('**/rest/v1/waitlist_invitation*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.getByText('Sign In').click();
    
    // Verify matches are displayed
    await expect(page.getByText('open', { exact: true }).first()).toBeVisible();
    // We can check for specific match details if we want, but checking for status text is a good start
    
    // Check for the second match status (might be calculated as 'waiting' by getMatchStatus util)
    // The util logic: if now < signup_open_at -> waiting.
    // Match 2 signup_open_at is tomorrow, so it should be waiting.
    // However, the status in DB is 'scheduled'. The UI computes status.
    // Let's check for 'WAITING' or 'SCHEDULED' depending on what the UI shows.
    // Based on matches.tsx: getMatchStatus returns 'waiting' if not open yet.
    // And getStatusColor handles 'waiting'.
    // The UI displays the status text.
    
    // We need to wait for the list to load
    await expect(page.getByText('2 teams', { exact: true })).toHaveCount(2);
  });

  test('should show empty state', async ({ page }) => {
    // Mock empty matches response
    await page.route('**/rest/v1/match*', async (route) => {
      await route.fulfill({ json: [] });
    });

    // Capacity RPC returns empty
    await page.route('**/rest/v1/rpc/get_match_capacity*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/rest/v1/signup*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/rest/v1/waitlist_invitation*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.getByText('Sign In').click();
    
    await expect(page.getByText('No upcoming matches')).toBeVisible();
  });

  test('should not show a reserved spot as free (join CTA becomes join waitlist)', async ({ page }) => {
    const reservedMatch = [
      {
        id: '1',
        club_id: 'club1',
        kick_off: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        signup_open_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        spots: 10,
        teams_count: 2,
        status: 'scheduled',
        created_at: new Date().toISOString(),
      },
    ];

    await page.route('**/rest/v1/match*', async (route) => {
      await route.fulfill({ json: reservedMatch });
    });

    // 9 confirmed + 1 reserved => 0 spots left
    await page.route('**/rest/v1/rpc/get_match_capacity*', async (route) => {
      await route.fulfill({
        json: [{ match_id: '1', confirmed_count: 9, reserved_count: 1 }],
      });
    });

    await page.route('**/rest/v1/signup*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/rest/v1/waitlist_invitation*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.getByText('Sign In').click();

    await expect(page.getByText('0/10 spots left')).toBeVisible();
    await expect(page.getByText('Reserved', { exact: true })).toBeVisible();
    await expect(page.getByText('JOIN WAITLIST', { exact: true })).toBeVisible();
  });

  test('should show invitation banner and call accept-invitation', async ({ page }) => {
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    const matchId = '1';
    const invitationId = 'inv-1';

    await page.route('**/rest/v1/match*', async (route) => {
      await route.fulfill({ json: mockMatches });
    });

    await page.route('**/rest/v1/rpc/get_match_capacity*', async (route) => {
      await route.fulfill({
        json: [
          { match_id: '1', confirmed_count: 0, reserved_count: 0 },
          { match_id: '2', confirmed_count: 0, reserved_count: 0 },
        ],
      });
    });

    await page.route('**/rest/v1/signup*', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.route('**/rest/v1/waitlist_invitation*', async (route) => {
      await route.fulfill({
        json: [
          {
            id: invitationId,
            match_id: matchId,
            user_id: 'user123',
            status: 'pending',
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            responded_at: null,
            match: { kick_off: mockMatches[0].kick_off },
          },
        ],
      });
    });

    await page.route('**/functions/v1/accept-invitation', async (route) => {
      await route.fulfill({ json: { success: true, matchId } });
    });

    await page.getByText('Sign In').click();

    await expect(page.getByText('Spot Available!')).toBeVisible();

    const acceptRequestPromise = page.waitForRequest('**/functions/v1/accept-invitation');
    await page.getByText('Accept', { exact: true }).click();
    await acceptRequestPromise;
  });
});
