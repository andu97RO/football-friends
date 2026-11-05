import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore } from './auth-store';

const AUTH_LOCK_TIMEOUT_MS = 10_000;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Capture recovery intent before Expo normalizes the initial browser URL and
// the SDK consumes the token fragment. The callback can then use the session.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const url = new URL(window.location.href);
  if (url.searchParams.get('type') === 'recovery' || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery') {
    useAuthStore.getState().setRecovery(true);
  }
}

/** Runs `operation` under an exclusive cross-tab lock, giving up (without running it) after `timeout` ms. */
async function exclusiveTabLock<R>(name: string, timeout: number, operation: () => Promise<R>): Promise<R> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout > 0 ? timeout : AUTH_LOCK_TIMEOUT_MS);
  try {
    return await navigator.locks.request(name, { mode: 'exclusive', signal: controller.signal }, () => {
      clearTimeout(timer);
      return operation();
    });
  } catch (error) {
    if (controller.signal.aborted && error instanceof Error && error.name === 'AbortError') {
      const timeoutError = Object.assign(new Error('Authentication session is busy.'), { isAcquireTimeout: true });
      timeoutError.name = 'AuthLockTimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Keep cross-tab session protection, but never queue forever behind a
    // suspended tab. A timed-out lock request is cancelled before it can save.
    // supabase-js's own navigatorLock steals the lock on timeout instead, so
    // the app uses navigator.locks directly to keep the cancel-and-retry behaviour.
    ...(Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.locks ? {
      lock: exclusiveTabLock,
      lockAcquireTimeout: AUTH_LOCK_TIMEOUT_MS,
    } : {}),
  },
});
