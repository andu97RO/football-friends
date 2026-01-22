-- Add push_token column to profile table for Expo Push Notifications
ALTER TABLE public.profile 
ADD COLUMN IF NOT EXISTS push_token text;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profile_push_token ON public.profile(push_token);

-- Add comment
COMMENT ON COLUMN public.profile.push_token IS 'Expo push notification token for sending notifications to user';

