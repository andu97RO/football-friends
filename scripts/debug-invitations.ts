/**
 * Debug script to test waitlist invitation flow
 * Run with: npx tsx scripts/debug-invitations.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function debugInvitations() {
  console.log('🔍 Debugging Waitlist Invitation System\n');
  console.log('═'.repeat(60));

  // 1. Check if waitlist_invitation table exists
  console.log('\n1️⃣  Checking if waitlist_invitation table exists...');
  const { data: tables, error: tableError } = await supabase
    .from('waitlist_invitation')
    .select('id')
    .limit(1);

  if (tableError) {
    console.error('❌ Table does not exist or has errors:');
    console.error('   Error:', tableError.message);
    console.log('\n💡 Solution: Run the SQL in supabase/waitlist_invitation.sql');
    return;
  }
  console.log('✅ Table exists');

  // 2. Check RLS policies
  console.log('\n2️⃣  Checking RLS policies...');
  console.log('✅ RLS policies should be in place (manual verification needed)');
  console.log('   Expected policies:');
  console.log('   - Users can view own invitations');
  console.log('   - Admins can view invitations for their matches');

  // 3. Check for existing invitations
  console.log('\n3️⃣  Checking existing invitations...');
  const { data: invitations, error: invError } = await supabase
    .from('waitlist_invitation')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (invError) {
    console.error('❌ Error fetching invitations:', invError.message);
  } else {
    console.log(`📋 Found ${invitations?.length || 0} invitations (showing last 10)`);
    if (invitations && invitations.length > 0) {
      invitations.forEach((inv: any) => {
        const expired = new Date(inv.expires_at) < new Date();
        console.log(`   - Status: ${inv.status} | Expires: ${new Date(inv.expires_at).toLocaleString()} ${expired ? '(EXPIRED)' : ''}`);
      });
    }
  }

  // 4. Check for matches with waitlist
  console.log('\n4️⃣  Checking matches with waitlisted players...');
  const { data: matches } = await supabase
    .from('match')
    .select('id, kick_off, spots, status')
    .eq('status', 'scheduled')
    .gte('kick_off', new Date().toISOString())
    .order('kick_off', { ascending: true })
    .limit(5);

  if (matches && matches.length > 0) {
    console.log(`📅 Found ${matches.length} upcoming scheduled matches`);
    
    for (const match of matches) {
      const { data: signups } = await supabase
        .from('signup')
        .select('state')
        .eq('match_id', match.id);

      const confirmed = signups?.filter(s => s.state === 'confirmed').length || 0;
      const waitlist = signups?.filter(s => s.state === 'waitlist').length || 0;

      console.log(`\n   Match: ${new Date(match.kick_off).toLocaleString()}`);
      console.log(`   Spots: ${confirmed}/${match.spots} | Waitlist: ${waitlist}`);

      if (waitlist > 0) {
        const { data: waitlistUsers } = await supabase
          .from('signup')
          .select('*, profile:user_id(display_name, push_token)')
          .eq('match_id', match.id)
          .eq('state', 'waitlist')
          .order('queue_pos', { ascending: true });

        console.log(`   Waitlist players:`);
        waitlistUsers?.forEach((user: any, idx: number) => {
          const hasPushToken = !!user.profile?.push_token;
          console.log(`      ${idx + 1}. ${user.profile?.display_name || 'Unknown'} ${hasPushToken ? '✅' : '❌ No push token'}`);
        });
      }
    }
  } else {
    console.log('⚠️  No upcoming scheduled matches found');
  }

  // 5. Check Edge Functions
  console.log('\n5️⃣  Checking Edge Function deployment...');
  console.log('   Expected functions:');
  console.log('   - accept-invitation');
  console.log('   - decline-invitation');
  console.log('   - handle-expired-invitations');
  console.log('   - cancel-signup (updated)');
  console.log('\n   Verify at: https://supabase.com/dashboard/project/[YOUR_PROJECT_REF]/functions');

  // 6. Test invitation query (as regular user would see)
  console.log('\n6️⃣  Testing invitation query (simulated user view)...');
  const testUserId = '00000000-0000-0000-0000-000000000000'; // Dummy ID
  const { data: userInvitations, error: userInvError } = await supabase
    .from('waitlist_invitation')
    .select('*, match:match_id(kick_off)')
    .eq('user_id', testUserId)
    .eq('status', 'pending')
    .gte('expires_at', new Date().toISOString());

  if (userInvError) {
    console.log(`   ⚠️  Query would fail: ${userInvError.message}`);
    if (userInvError.message.includes('violates row-level security')) {
      console.log('   💡 This is expected - RLS is working correctly');
    }
  } else {
    console.log('   ✅ Query structure is valid');
  }

  // 7. Check audit log for invitation events
  console.log('\n7️⃣  Checking audit log for invitation events...');
  const { data: auditLogs } = await supabase
    .from('audit_log')
    .select('*')
    .in('action', ['invitation_sent', 'invitation_accepted', 'invitation_declined', 'invitation_expired'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (auditLogs && auditLogs.length > 0) {
    console.log(`📜 Found ${auditLogs.length} invitation-related audit logs:`);
    auditLogs.forEach((log: any) => {
      console.log(`   - ${log.action} at ${new Date(log.created_at).toLocaleString()}`);
    });
  } else {
    console.log('   ⚠️  No invitation audit logs found yet');
    console.log('   💡 This means no invitations have been sent/processed');
  }

  // Summary
  console.log('\n═'.repeat(60));
  console.log('\n📊 SUMMARY:');
  console.log('   Database table: ✅');
  console.log(`   Existing invitations: ${invitations?.length || 0}`);
  console.log(`   Matches with waitlist: Check output above`);
  console.log(`   Audit logs: ${auditLogs?.length || 0}`);
  
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. Test by canceling a confirmed signup in a full match');
  console.log('   2. Check if invitation appears in waitlist_invitation table');
  console.log('   3. Check Supabase Edge Function logs for errors');
  console.log('   4. Verify push token is set for waitlisted users');
  console.log('   5. Check app logs for invitation query results');
  console.log('\n');
}

debugInvitations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

