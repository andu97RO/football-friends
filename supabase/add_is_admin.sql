-- Migration: Add is_admin column to profile table
-- Run this in your Supabase SQL Editor

-- Step 1: Add is_admin column to profile table
ALTER TABLE profile ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Step 2: Create a default club if none exists
-- This will be the single club for all matches
INSERT INTO club (name, organizer_id)
SELECT 'Football Friends Club', (SELECT id FROM auth.users LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM club LIMIT 1);

-- Step 3: Set yourself as admin
-- First, find your user_id by running this query:
-- SELECT id, email FROM auth.users;
-- 
-- Then uncomment and run this with your user_id:
-- UPDATE profile SET is_admin = true WHERE user_id = 'your-user-id-here';

-- Example (replace with your actual user_id):
-- UPDATE profile SET is_admin = true WHERE user_id = '123e4567-e89b-12d3-a456-426614174000';

-- To make someone an admin in the future, just run:
-- UPDATE profile SET is_admin = true WHERE user_id = 'their-user-id';

-- To remove admin access:
-- UPDATE profile SET is_admin = false WHERE user_id = 'their-user-id';

