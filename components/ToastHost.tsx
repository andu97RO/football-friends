import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useToastStore } from '@/lib/toast';
import { Txt } from '@/components/ui';

export default function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.duration ?? (toast.action ? 6000 : 3500));
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 100 }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(150)}
        style={[styles.toast, toast.tone === 'error' && styles.error]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        testID="toast"
      >
        <Txt variant="bodyStrong" style={{ flex: 1 }}>{toast.message}</Txt>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            testID="toast-action"
            onPress={() => {
              dismiss(toast.id);
              toast.action!.onPress();
            }}
            style={styles.action}
          >
            <Txt variant="bodyStrong" tone="primary">{toast.action.label}</Txt>
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
