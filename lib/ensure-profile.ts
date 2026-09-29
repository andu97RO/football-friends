import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

/**
 * Ensures a profile row exists for the authenticated user.
 * Creates a default profile on first login so chat FKs, display names,
 * and push token registration work before the Profile tab is opened.
 */
export async function ensureProfile(
  userId: string,
  _email?: string | null
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profile')
    .select('user_id,display_name,avatar_url,created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data) {
    return data as Profile;
  }

  const { error: createError } = await supabase.rpc('initialize_profile');
  if (createError) throw createError;
  const { data: newProfile, error: readError } = await supabase.from('profile')
    .select('user_id,display_name,avatar_url,created_at').eq('user_id', userId).single();
  if (readError) throw readError;
  return newProfile as Profile;
}
