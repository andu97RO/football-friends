import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, navigatorLock } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const AUTH_LOCK_TIMEOUT_MS = 10_000;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Keep cross-tab session protection, but never queue forever behind a
    // suspended tab. A timed-out lock request is cancelled before it can save.
    ...(Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.locks ? {
      lock: async <R,>(name: string, timeout: number, operation: () => Promise<R>): Promise<R> => {
        try {
          return await navigatorLock(name, timeout < 0 ? AUTH_LOCK_TIMEOUT_MS : timeout, operation);
        } catch (error) {
          if (timeout < 0 && error instanceof Error && error.name === 'AbortError') {
            const timeoutError = new Error('Authentication session is busy.');
            timeoutError.name = 'AuthLockTimeoutError';
            throw timeoutError;
          }
          throw error;
        }
      },
    } : {}),
  },
});
