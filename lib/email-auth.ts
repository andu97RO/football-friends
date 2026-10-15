import { supabase } from './supabase';
import { t } from './i18n';

/** Keep signup enabled for both the first request and resends. */
export async function requestEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export function emailAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : '';
  // Older Auth responses may omit the structured error code.
  if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message)) return t('auth.emailLimit');
  if (code === 'over_request_rate_limit') return t('auth.requestLimit');
  if (code === 'otp_expired' || /token has expired or is invalid/i.test(message)) return t('auth.invalidCode');
  return error instanceof Error ? error.message : t('auth.loginFailed');
}
