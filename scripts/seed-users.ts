/**
 * Seed script to create test users in Supabase
 * Run with: npx tsx scripts/seed-users.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Load environment variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // You'll need this

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

const firstNames = [
  'James', 'John', 'Robert', 'Michael', 'William',
  'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald',
  'Steven', 'Andrew', 'Paul', 'Joshua', 'Kenneth'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
  'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
];

async function seedUsers(count: number = 20) {
  console.log(`Creating ${count} test users...`);

  const users = [];

  for (let i = 1; i <= count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const email = `player${i}@footytest.com`;
    const password = 'Test123!'; // Simple password for testing

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        display_name: `${firstName} ${lastName}`,
      },
    });

    if (authError) {
      console.error(`Error creating user ${email}:`, authError.message);
      continue;
    }

    console.log(`✓ Created user: ${email} (${firstName} ${lastName})`);

    // Create profile
    const rating = Math.floor(Math.random() * 5) + 1; // Random rating 1-5
    const { error: profileError } = await supabase
      .from('profile')
      .insert({
        user_id: authData.user.id,
        display_name: `${firstName} ${lastName}`,
        rating_base: rating,
      });

    if (profileError) {
      console.error(`Error creating profile for ${email}:`, profileError.message);
    } else {
      console.log(`  ✓ Created profile (rating: ${rating})`);
    }

    users.push({
      email,
      password,
      name: `${firstName} ${lastName}`,
      id: authData.user.id,
    });
  }

  console.log('\n=== Summary ===');
  console.log(`Created ${users.length} users`);
  console.log('\nTest credentials (all use password: Test123!):');
  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.email} - ${user.name}`);
  });

  console.log('\n=== Quick Login Info ===');
  console.log('Email: player1@footytest.com');
  console.log('Password: Test123!');

  return users;
}

// Run the script
seedUsers(20)
  .then(() => {
    console.log('\n✓ Seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding users:', error);
    process.exit(1);
  });
