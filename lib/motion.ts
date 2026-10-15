import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, ReduceMotion, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/constants/theme';

export const EASE_OUT = Easing.bezier(...theme.motion.easeOut);

/** Reanimated supplies the initial value; subscribe to changes while the app is open. */
export function useSystemReducedMotion() {
  const initial = useReducedMotion();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      changed = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active && !changed) setReduced(value);
    }).catch(() => undefined);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return reduced;
}

/** Keep conditionally mounted form content alive long enough for its sheet to exit. */
export function useExitRetention<T>(value: T | null): T | null {
  const [retained, setRetained] = useState(value);
  useEffect(() => {
    if (value !== null) {
      setRetained(value);
      return;
    }
    const timer = setTimeout(() => setRetained(null), theme.motion.modalExit);
    return () => clearTimeout(timer);
  }, [value]);
  return value ?? retained;
}

/** Keep a surface mounted through its exit, and retarget when visibility reverses. */
export function useMotionPresence(visible: boolean, enter: number, exit: number) {
  const [present, setPresent] = useState(visible);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (visible) setPresent(true);
    progress.set(withTiming(visible ? 1 : 0, {
      duration: visible ? enter : exit,
      easing: EASE_OUT,
      // Reduced motion is applied to transforms by the caller; keep the fade.
      reduceMotion: ReduceMotion.Never,
    }));
    if (!visible) {
      const timer = setTimeout(() => setPresent(false), exit);
      return () => clearTimeout(timer);
    }
  }, [visible, enter, exit, progress]);
  return { present: visible || present, progress };
}
