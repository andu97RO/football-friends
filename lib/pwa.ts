import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const DISMISSED_KEY = 'footballfriends.installHintDismissed';
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/** Chromium fires this when the app can be installed; it is not in the DOM typings. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// The event can fire before any screen mounts, so it is captured at import time.
let installPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<(event: InstallPromptEvent | null) => void>();

function setInstallPrompt(event: InstallPromptEvent | null) {
  installPrompt = event;
  promptListeners.forEach((listener) => listener(event));
}

if (isWeb) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setInstallPrompt(event as InstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => setInstallPrompt(null));
}

/** True when the app was opened from the home screen instead of a browser tab. */
export function isStandalone(): boolean {
  if (!isWeb) return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  if (!isWeb) return false;
  // iPadOS reports itself as a Mac, but only the iPad has a touch screen.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Registers the service worker once the page has loaded. Production builds only: the dev server's
 * bundles are not hashed, so caching them would serve stale code.
 */
export function registerServiceWorker(): void {
  if (__DEV__ || !isWeb || !('serviceWorker' in navigator)) return;
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // The worker misses the first visit's requests, so it is told what this build loaded.
      const post = (urls: string[]) =>
        (navigator.serviceWorker.controller ?? registration.active)?.postMessage({ type: 'CACHE_URLS', urls });
      post(performance.getEntriesByType('resource').map((entry) => entry.name));
      // Route chunks keep loading as screens open, some before the worker controls the page.
      // Report each bundle file once it has loaded; the worker skips files it already has.
      if (typeof PerformanceObserver !== 'undefined') {
        new PerformanceObserver((list) => {
          const urls = list.getEntries().map((entry) => entry.name).filter((url) => url.includes('/_expo/static/'));
          if (urls.length) post(urls);
        }).observe({ type: 'resource' });
      }
    } catch (error) {
      console.warn('Could not register the service worker:', error);
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

/**
 * What the install card should offer: a real install button where the browser supports it (Chrome on
 * Android), written steps on iOS, where Safari has no install API, and nothing once installed or dismissed.
 */
export function useInstallHint(): { mode: 'prompt' | 'ios' | null; install: () => Promise<void>; dismiss: () => void } {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(installPrompt);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((value) => setDismissed(value === '1')).catch(() => setDismissed(false));
    promptListeners.add(setPrompt);
    return () => {
      promptListeners.delete(setPrompt);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => undefined);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt can only be used once.
    setInstallPrompt(null);
    if (outcome === 'accepted') dismiss();
  };

  if (!isWeb || dismissed !== false || isStandalone()) return { mode: null, install, dismiss };
  return { mode: prompt ? 'prompt' : isIos() ? 'ios' : null, install, dismiss };
}
