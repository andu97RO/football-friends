# Admin Features Guide

This guide covers the new admin features for managing player ratings and team assignments.

## Table of Contents
- [Player Rating Management](#player-rating-management)
- [Manual Team Adjustments](#manual-team-adjustments)
- [Deployment](#deployment)
- [Testing](#testing)

## Player Rating Management

### Overview
Admins can edit player ratings (1-5 scale) which are used for automated team balancing. The rating system allows admins to adjust player skill levels to ensure fair team distribution.

### Features
- **Tabbed Interface**: Navigate between "Matches" and "Players" tabs in the Admin screen
- **Search & Filter**: Quickly find players by name
- **Star Rating UI**: Tap stars to set ratings (1-5)
- **Real-time Updates**: Changes are reflected immediately
- **Audit Logging**: All rating changes are logged for tracking

### How to Use
1. Navigate to the **Admin** tab
2. Switch to the **Players** tab
3. Use the search bar to find a specific player (optional)
4. Tap the stars next to a player's name to set their rating
5. The rating is saved automatically

### Technical Details

**Files Modified:**
- `app/(tabs)/admin.tsx` - Added Players tab with rating editor
- `supabase/admin-policies.sql` - Added RLS policy for admin profile updates

**Database:**
- Updates `profile.rating_base` (1-5 integer)
- Creates audit log entry with action `update_player_rating`

**API Calls:**
```typescript
// Update player rating
await supabase
  .from('profile')
  .update({ rating_base: newRating })
  .eq('user_id', userId);

// Log audit trail
await supabase.from('audit_log').insert({
  user_id: session.user.id,
  action: 'update_player_rating',
  meta: { target_user_id: userId, new_rating: newRating },
});
```

---

## Manual Team Adjustments

### Overview
After teams are automatically generated, admins can manually move players between teams if the initial distribution isn't satisfactory.

### Features
- **Edit Mode Toggle**: Enable/disable team editing
- **Visual Feedback**: Players in edit mode show a chevron indicator
- **Modal Selection**: Select destination team from a clean modal interface
- **Real-time Balance**: See team ratings update after each move
- **Push Notifications**: Players receive notifications when moved to a new team
- **Audit Logging**: All team changes are logged

### How to Use
1. Navigate to a match with locked teams (Teams screen)
2. Tap the **"Edit Teams"** button (admin only)
3. Tap a player to select them
4. Choose the destination team from the modal
5. The player is moved instantly
6. Tap **"Cancel"** to exit edit mode

### User Flow
```
Teams Screen → "Edit Teams" button
  ↓
Tap player → "Move Player" modal appears
  ↓
Select destination team
  ↓
Player moved + Push notification sent
  ↓
Teams refresh with new assignments
```

### Technical Details

**Files Modified:**
- `app/teams/[id].tsx` - Added edit mode and move player UI
- `supabase/functions/swap-players/index.ts` - New Edge Function
- `supabase/admin-policies.sql` - Added RLS policies for team updates

**Edge Function: swap-players**

**Endpoint:**
```typescript
POST /functions/v1/swap-players
```

**Request Body:**
```json
{
  "matchId": "uuid",
  "playerId": "uuid",
  "fromTeamId": "uuid",
  "toTeamId": "uuid"
}
```

**Authorization:**
- Requires valid JWT token in Authorization header
- User must be match organizer OR admin
- Match must be in "locked" status (not scheduled, completed, or cancelled)

**Process:**
1. Verify user authorization (organizer or admin)
2. Check match status (must be locked)
3. Update `team_assignment` record atomically
4. Create audit log entry
5. Send push notification to affected player
6. Return success with team names

**Response:**
```json
{
  "success": true,
  "message": "Player moved from Team A to Team B"
}
```

**Error Handling:**
- Unauthorized: Not organizer or admin
- Invalid status: Match not locked
- Teams not found: Invalid team IDs
- Database errors: Propagated to client

---

## Deployment

### 1. Apply Database Policies

Run the admin policies SQL in your Supabase SQL Editor:

```bash
# Connect to your Supabase project
# Navigate to SQL Editor
# Run the contents of:
supabase/admin-policies.sql
```

Or via CLI:
```bash
supabase db push --db-url "postgresql://..."
```

### 2. Deploy Edge Function

Deploy the swap-players Edge Function:

```bash
supabase functions deploy swap-players
```

Verify deployment:
```bash
supabase functions list
```

You should see `swap-players` in the list.

### 3. Verify Environment Variables

The Edge Function uses these environment variables (automatically set by Supabase):
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (auto-injected)

### 4. Test Permissions

Create a test admin user:

```sql
-- In Supabase SQL Editor
UPDATE profile
SET is_admin = true
WHERE user_id = 'your-test-user-id';
```

### 5. Mobile App Deployment

No changes needed - the app will pick up the new UI automatically on next build.

For production:
```bash
# Build new version
eas build --platform all

# Update OTA if using Expo Updates
eas update --branch production
```

---

## Testing

### Testing Player Rating Management

**Manual Test:**
1. Log in as admin user
2. Navigate to Admin tab → Players
3. Change a player's rating
4. Verify rating updates in UI
5. Check audit_log table:
   ```sql
   SELECT * FROM audit_log
   WHERE action = 'update_player_rating'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

**Expected Result:**
- Rating updates immediately
- Audit log entry created
- No errors in console

### Testing Team Adjustments

**Setup:**
1. Create a match as admin
2. Have users sign up (min 6 players)
3. Lock the match and generate teams
4. Navigate to Teams screen

**Manual Test:**
1. Tap "Edit Teams" button
2. Tap a player
3. Select different team from modal
4. Verify player moves successfully
5. Check for push notification on player's device
6. Verify audit log:
   ```sql
   SELECT * FROM audit_log
   WHERE action = 'swap_player_team'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

**Expected Result:**
- Player appears in new team
- Player receives push notification
- Team ratings recalculate
- Audit log entry created

### Testing Permissions

**Non-Admin User:**
1. Log in as regular user
2. Navigate to Teams screen
3. Verify "Edit Teams" button does NOT appear
4. Try calling swap-players API directly (should fail with 401)

**Unauthorized Match:**
1. Log in as admin for Club A
2. Try to edit teams for Club B's match
3. Should fail with "Unauthorized" error

### Edge Cases

**Test these scenarios:**
1. Moving player to same team (should be no-op)
2. Editing teams for completed match (should fail)
3. Editing teams for scheduled match (should fail)
4. Multiple admins editing simultaneously
5. Player with no push token (should not crash)
6. Invalid team IDs (should return error)

### Automated Tests (Future)

Add E2E tests for these features:

```typescript
// e2e/admin.spec.ts
test('admin can update player ratings', async ({ page }) => {
  // Login as admin
  // Navigate to Players tab
  // Update rating
  // Verify database update
});

test('admin can move players between teams', async ({ page }) => {
  // Login as admin
  // Navigate to locked match teams
  // Enable edit mode
  // Move player
  // Verify team assignment
});
```

---

## Troubleshooting

### Rating Updates Not Saving
**Symptom:** Stars change but rating doesn't persist

**Solutions:**
1. Check RLS policies are applied:
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'profile';
   ```
2. Verify user has `is_admin = true`
3. Check browser console for errors

### Team Swap Fails
**Symptom:** "Error moving player" alert

**Solutions:**
1. Check Edge Function logs:
   ```bash
   supabase functions logs swap-players
   ```
2. Verify match status is "locked":
   ```sql
   SELECT status FROM match WHERE id = 'match-id';
   ```
3. Check RLS policies on `team_assignment`

### Push Notifications Not Sending
**Symptom:** Player moved but no notification received

**Solutions:**
1. Verify player has valid `push_token` in profile
2. Check Edge Function logs for notification errors
3. Test Expo Push API manually:
   ```bash
   curl -H "Content-Type: application/json" \
        -X POST https://exp.host/--/api/v2/push/send \
        -d '{"to":"ExponentPushToken[...]","body":"Test"}'
   ```

### "Edit Teams" Button Not Visible
**Symptom:** Admin can't see edit button

**Solutions:**
1. Verify `is_admin = true` in profile
2. Check teams are generated (not empty)
3. Clear React Query cache (restart app)

---

## Future Enhancements

Potential improvements for these features:

1. **Drag & Drop**: Implement true drag-and-drop instead of modal
2. **Undo**: Add undo button for accidental moves
3. **Batch Updates**: Move multiple players at once
4. **Rating History**: Show historical rating changes per player
5. **CSV Import**: Bulk import player ratings from CSV
6. **Team Templates**: Save/load team configurations
7. **Balance Score**: Show team balance score (variance metric)
8. **Auto-suggest Swaps**: Suggest optimal player swaps for better balance

---

## Architecture Notes

### Why Edge Functions for Team Swaps?

We use Edge Functions instead of client-side updates for several reasons:

1. **Atomic Operations**: Ensures team_assignment updates are atomic
2. **Authorization**: Centralized auth check (organizer or admin)
3. **Push Notifications**: Requires server-side Expo Push API call
4. **Audit Logging**: Guaranteed logging with service role
5. **Validation**: Server-side validation of match status

### RLS Policy Design

The admin policies follow the principle of least privilege:

- Admins can update profiles (for ratings)
- Admins can update team_assignments (for swaps)
- Regular users cannot perform these actions
- All changes are logged in audit_log (insert via service role only)

This ensures security while allowing admin flexibility.

---

## Support

For issues or questions:
1. Check Supabase Dashboard → Edge Functions → Logs
2. Check browser console for React errors
3. Verify RLS policies are applied correctly
4. Review audit_log table for debugging
