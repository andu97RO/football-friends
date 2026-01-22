import { test, expect } from '@playwright/test';

test.describe('Match Details', () => {
  const mockMatch = {
    id: '123',
    club_id: 'club1',
    kick_off: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    signup_open_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    spots: 10,
    teams_count: 2,
    status: 'open',
    created_at: new Date().toISOString(),
  };

  const mockProfiles = [
    { user_id: 'user1', display_name: 'Messi', rating_base: 10, created_at: new Date().toISOString() },
    { user_id: 'user2', display_name: 'Ronaldo', rating_base: 9, created_at: new Date().toISOString() },
    { user_id: 'user3', display_name: 'Neymar', rating_base: 8, created_at: new Date().toISOString() },
  ];

  const mockSignups = [
    { id: 1, match_id: '123', user_id: 'user1', state: 'confirmed', queue_pos: null, created_at: new Date().toISOString() },
    { id: 2, match_id: '123', user_id: 'user2', state: 'confirmed', queue_pos: null, created_at: new Date().toISOString() },
    { id: 3, match_id: '123', user_id: 'user3', state: 'waitlist', queue_pos: 1, created_at: new Date().toISOString() },
  ];

  test.beforeEach(async ({ page }) => {
    // Mock Supabase requests
    await page.route('**/rest/v1/match*', async (route) => {
      await route.fulfill({ json: mockMatch });
    });

    // Mock capacity RPC for reserved spots
    await page.route('**/rest/v1/rpc/get_match_capacity*', async (route) => {
      await route.fulfill({
        json: [{ match_id: '123', confirmed_count: 2, reserved_count: 0 }],
      });
    });

    await page.route('**/rest/v1/signup*', async (route) => {
      const url = route.request().url();
      if (url.includes('select=*') && !url.includes('user_id=eq.')) {
         // Fetch all signups
         await route.fulfill({ json: mockSignups });
      } else if (url.includes('user_id=eq.')) {
          // Fetch my signup - simulate not joined initially
          await route.fulfill({ json: null });
      } else {
          await route.continue();
      }
    });
    
    await page.route('**/rest/v1/profile*', async (route) => {
        await route.fulfill({ json: mockProfiles });
    });

    await page.goto('/match/123');
  });

  test('should display match details and joined players', async ({ page }) => {
    // Check match status
    await expect(page.getByText('open', { exact: true })).toBeVisible();
    
    // Check stats card
    await expect(page.getByText('2/10')).toBeVisible(); // Spots
    await expect(page.getByText('1', { exact: true })).toBeVisible(); // Waitlist count
    
    // Check confirmed players section
    await expect(page.getByText('Confirmed Players')).toBeVisible();
    await expect(page.getByText('Messi')).toBeVisible();
    await expect(page.getByText('Ronaldo')).toBeVisible();

    // Check waitlist section
    // There are multiple "Waitlist" texts (one in stats, one in section header). 
    // We can check for the section header specifically or just ensure the players are there.
    await expect(page.getByText('Neymar')).toBeVisible();
    await expect(page.getByText('#1')).toBeVisible();
  });

  test('should include reserved invitations in the Spots counter', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_match_capacity*', async (route) => {
      await route.fulfill({
        json: [{ match_id: '123', confirmed_count: 2, reserved_count: 1 }],
      });
    });

    await page.reload();

    // Spots counter is occupied_count/spots, where occupied_count = confirmed + reserved
    await expect(page.getByText('3/10')).toBeVisible();
  });

  test('should show empty state when no players joined', async ({ page }) => {
     await page.route('**/rest/v1/signup*', async (route) => {
        const url = route.request().url();
        if (url.includes('select=*') && !url.includes('user_id=eq.')) {
            await route.fulfill({ json: [] });
        } else {
             await route.fulfill({ json: null });
        }
    });
    
    await page.reload();

    await expect(page.getByText('Confirmed Players')).toBeVisible();
    await expect(page.getByText('No players joined yet')).toBeVisible();
    
    // Waitlist section should not be visible if count is 0
    // The stats card will show "0" for waitlist, but the section "Waitlist" should be hidden
    // We need to be careful not to match the "Waitlist" label in the stats card.
    // The stats card has "Waitlist" label. The section has "Waitlist" title.
    // In the code: {waitlistCount > 0 && <View ...><Text>Waitlist</Text>...}
    // So if count is 0, the section title "Waitlist" is not rendered.
    // However, "Waitlist" text IS visible in the stats card.
    // So .not.toBeVisible() for 'Waitlist' would fail.
    
    // We can check that the waitlist player is not visible
    await expect(page.getByText('Neymar')).not.toBeVisible();
  });
});
