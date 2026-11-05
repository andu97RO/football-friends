import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
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

/** True on iPhones and iPads that can show the system Sign in with Apple sheet. */
export async function isNativeAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple through the iOS system sheet (App Store guideline 4.8).
 * Apple signs a hashed nonce into the identity token and Supabase checks it
 * against the raw one. Returns false when the player cancels.
 */
export async function signInWithAppleNative(): Promise<boolean> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }
  if (!credential.identityToken) throw new Error(t('auth.oauthFailed'));

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw friendly(error.message);

  // Apple shares the name only on the very first sign-in and never puts it in the token.
  // Keep it on the account so onboarding can suggest it.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
  if (fullName) {
    await supabase.auth.updateUser({
      data: { full_name: fullName, given_name: credential.fullName?.givenName ?? undefined, family_name: credential.fullName?.familyName ?? undefined },
    });
  }
  return true;
}

function friendly(message: string): Error {
  if (/provider is not enabled|unsupported provider/i.test(message)) return new Error(t('auth.providerDisabled'));
  return new Error(message);
}
