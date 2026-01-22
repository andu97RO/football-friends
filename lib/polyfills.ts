/**
 * Polyfills for web compatibility
 * This file must be imported before any other imports that might use these features
 */

import { Platform } from 'react-native';

// Polyfill import.meta for Metro bundler on web
// This is needed for @supabase/supabase-js which uses import.meta internally
if (Platform.OS === 'web') {
  // Define import.meta globally
  if (typeof (window as any).import === 'undefined') {
    (window as any).import = {};
  }
  if (typeof (window as any).import.meta === 'undefined') {
    (window as any).import.meta = {
      url: window.location.href,
      env: {},
    };
  }
  
  // Also set it on globalThis for better compatibility
  if (typeof (globalThis as any).import === 'undefined') {
    (globalThis as any).import = (window as any).import;
  }
}

export {};

