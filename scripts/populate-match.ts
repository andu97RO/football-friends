/**
 * Script to populate an open match with players for testing team generation
 * Run with: npx tsx scripts/populate-match.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Load environment variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  console.error('EXPO_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function populateMatch() {
  console.log('🏃 Starting match population...\n');

  // 1. Find an open match
  console.log('1️⃣ Finding an open match...');
  const { data: matches, error: matchError } = await supabase
    .from('match')
    .select('*')
    .eq('status', 'scheduled')
    .gte('kick_off', new Date().toISOString())
    .lte('signup_open_at', new Date().toISOString())
    .order('kick_off', { ascending: true })
    .limit(1);

  if (matchError) {
    console.error('❌ Error finding match:', matchError.message);
    process.exit(1);
  }

  if (!matches || matches.length === 0) {
    console.error('❌ No open matches found. Please create a match first.');
    process.exit(1);
  }

  const match = matches[0];
  console.log(`✅ Found match: ${new Date(match.kick_off).toLocaleString()}`);
  console.log(`   Match ID: ${match.id}`);
  console.log(`   Spots available: ${match.spots}`);
  console.log(`   Teams: ${match.teams_count}\n`);

  // 2. Get existing signups for this match
  console.log('2️⃣ Checking existing signups...');
  const { data: existingSignups, error: signupsError } = await supabase
    .from('signup')
    .select('user_id')
    .eq('match_id', match.id)
    .neq('state', 'cancelled');

  if (signupsError) {
    console.error('❌ Error checking signups:', signupsError.message);
    process.exit(1);
  }

  const existingUserIds = new Set(existingSignups?.map(s => s.user_id) || []);
  console.log(`   Existing signups: ${existingUserIds.size}\n`);

  // 3. Get all users from the database
  console.log('3️⃣ Fetching available users...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profile')
    .select('user_id, display_name, rating_base')
    .order('created_at', { ascending: true });

  if (profilesError) {
    console.error('❌ Error fetching users:', profilesError.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.error('❌ No users found in database. Please run seed-users.ts first.');
    process.exit(1);
  }

  console.log(`✅ Found ${profiles.length} users in database\n`);

  // 4. Filter out users who already signed up
  const availableUsers = profiles.filter(p => !existingUserIds.has(p.user_id));
  console.log(`   Available users to add: ${availableUsers.length}\n`);

  if (availableUsers.length === 0) {
    console.log('ℹ️  All users are already signed up for this match!');
    process.exit(0);
  }

  // 5. Calculate how many users to add
  const spotsLeft = match.spots - existingUserIds.size;
  const usersToAdd = Math.min(availableUsers.length, spotsLeft);
  
  console.log(`4️⃣ Adding ${usersToAdd} users to the match...`);
  console.log(`   Spots left: ${spotsLeft}`);
  console.log(`   Will add: ${usersToAdd} as confirmed`);
  
  if (availableUsers.length > spotsLeft) {
    console.log(`   Will add: ${availableUsers.length - spotsLeft} to waitlist\n`);
  } else {
    console.log();
  }

  // 6. Add users to the match
  const signupsToInsert = [];
  let confirmedCount = existingUserIds.size;
  
  for (let i = 0; i < availableUsers.length; i++) {
    const user = availableUsers[i];
    const isConfirmed = confirmedCount < match.spots;
    
    signupsToInsert.push({
      match_id: match.id,
      user_id: user.user_id,
      state: isConfirmed ? 'confirmed' : 'waitlist',
      queue_pos: isConfirmed ? null : (i - usersToAdd + 1),
    });

    if (isConfirmed) confirmedCount++;
  }

  // Insert in batches to avoid timeouts
  const batchSize = 10;
  let inserted = 0;

  for (let i = 0; i < signupsToInsert.length; i += batchSize) {
    const batch = signupsToInsert.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('signup')
      .insert(batch);

    if (insertError) {
      console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, insertError.message);
      continue;
    }

    inserted += batch.length;
    console.log(`   ✓ Inserted ${inserted}/${signupsToInsert.length} signups...`);
  }

  // 7. Display final summary
  console.log('\n✨ Match population complete!\n');
  console.log('═══════════════════════════════════════════');
  console.log('📊 MATCH SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`Match ID: ${match.id}`);
  console.log(`Kick Off: ${new Date(match.kick_off).toLocaleString()}`);
  console.log(`Total Spots: ${match.spots}`);
  console.log(`Teams: ${match.teams_count}`);
  console.log(`\nConfirmed Players: ${Math.min(confirmedCount, match.spots)}/${match.spots}`);
  
  const waitlistCount = Math.max(0, confirmedCount - match.spots);
  if (waitlistCount > 0) {
    console.log(`Waitlist: ${waitlistCount}`);
  }
  
  console.log('═══════════════════════════════════════════\n');
  
  if (confirmedCount >= match.spots) {
    console.log('✅ Match is full! You can now test the team generation.');
    console.log('\n💡 To generate teams:');
    console.log('   1. Go to Admin tab in the app');
    console.log('   2. Find this match');
    console.log('   3. Click "Lock & Generate Teams"');
  } else {
    console.log(`ℹ️  Match has ${match.spots - confirmedCount} spots remaining.`);
    console.log('   Run this script again or add more users to fill it up!');
  }
  
  console.log();
}

// Run the script
populateMatch()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

