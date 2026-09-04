import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

/**
 * Ensures a profile row exists for the authenticated user.
 * Creates a default profile on first login so chat FKs, display names,
 * and push token registration work before the Profile tab is opened.
 */
export async function ensureProfile(
  userId: string,
  email?: string | null
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data) {
    return data as Profile;
  }

  const { data: newProfile, error: createError } = await supabase
    .from('profile')
    .insert({
      user_id: userId,
      display_name: email?.split('@')[0] || 'Player',
      rating_base: 3,
    })
    .select()
    .single();

  if (createError) throw createError;
  return newProfile as Profile;
}
