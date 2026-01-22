import type { Session, User } from '@supabase/supabase-js';

/**
 * Returns true if the session's user is considered "verified" for email/password auth flows.
 *
 * Notes:
 * - For email provider users, Supabase sets `email_confirmed_at` (and/or `confirmed_at`) after verification.
 * - For non-email providers (OAuth), we treat the session as verified.
 */
export function isVerifiedSession(session: Session | null | undefined): session is Session {
  if (!session?.user) return false;
  return isVerifiedUser(session.user);
}

/**
 * Returns true if the user is verified for authentication-gated areas of the app.
 */
export function isVerifiedUser(user: User | null | undefined): boolean {
  if (!user) return false;

  const provider = (user.app_metadata as { provider?: string } | undefined)?.provider;
  if (provider && provider !== 'email') return true;

  const emailConfirmedAt = (user as unknown as { email_confirmed_at?: string | null }).email_confirmed_at;
  const confirmedAt = (user as unknown as { confirmed_at?: string | null }).confirmed_at;

  return Boolean(emailConfirmedAt || confirmedAt);
}


