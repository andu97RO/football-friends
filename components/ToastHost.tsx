import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useToastStore } from '@/lib/toast';
import { Txt } from '@/components/ui';
import { useMotionPresence, useSystemReducedMotion } from '@/lib/motion';

export default function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const [retained, setRetained] = useState(toast);
  const reduced = useSystemReducedMotion();
  const { present, progress } = useMotionPresence(!!toast, theme.motion.toastEnter, theme.motion.toastExit);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: reduced ? 0 : (1 - progress.get()) * 8 }],
  }));

  useEffect(() => {
    if (toast) setRetained(toast);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.duration ?? (toast.action ? 6000 : 3500));
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  const displayed = toast ?? retained;
  if (!present || !displayed) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 100 }]}>
      <Animated.View
        pointerEvents={toast ? 'auto' : 'none'}
        style={[styles.toast, displayed.tone === 'error' && styles.error, motionStyle]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        testID="toast"
      >
        <Txt variant="bodyStrong" style={{ flex: 1 }}>{displayed.message}</Txt>
        {displayed.action && (
          <Pressable
            accessibilityRole="button"
            testID="toast-action"
            onPress={() => {
              dismiss(displayed.id);
              displayed.action!.onPress();
            }}
            style={styles.action}
          >
            <Txt variant="bodyStrong" tone="primary">{displayed.action.label}</Txt>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: theme.spacing.m,
    paddingRight: 4,
    minHeight: 52,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  error: { borderColor: theme.colors.error },
  action: { minHeight: theme.hitTarget, minWidth: theme.hitTarget, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
