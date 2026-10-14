import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { getAuthCallbackUrl } from './auth-utils';
import { t } from './i18n';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'apple' | 'google';

/**
 * A1: one-tap sign-in with Apple or Google through Supabase OAuth.
 * Returns true when a session was established (native) or the page is
 * redirecting (web). The provider must be enabled in the Supabase dashboard.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<boolean> {
  const redirectTo = getAuthCallbackUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
  });
  if (error) throw friendly(error.message);
  if (Platform.OS === 'web') return true;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;

  const url = new URL(result.url);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const code = url.searchParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw friendly(exchangeError.message);
    return true;
  }
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error(hash.get('error_description') || t('auth.oauthFailed'));
  const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
  if (sessionError) throw friendly(sessionError.message);
  return true;
}

function friendly(message: string): Error {
  if (/provider is not enabled|unsupported provider/i.test(message)) return new Error(t('auth.providerDisabled'));
  return new Error(message);
}
