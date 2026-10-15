import { Modal, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import { useMotionPresence, useSystemReducedMotion } from '@/lib/motion';

/** Internal modal shell: the scrim fades in place while only the content moves. */
export function MotionModal({ visible, onClose, kind, children }: {
  visible: boolean;
  onClose: () => void;
  kind: 'sheet' | 'dialog';
  children: React.ReactNode | ((style: ViewStyle) => React.ReactNode);
}) {
  const reduced = useSystemReducedMotion();
  const { present, progress } = useMotionPresence(visible, theme.motion.modalEnter, theme.motion.modalExit);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: kind === 'sheet'
      ? [{ translateY: `${reduced ? 0 : (1 - progress.get()) * 100}%` }]
      : [{ scale: reduced ? 1 : 0.95 + progress.get() * 0.05 }],
  }));

  if (!present) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, backdropStyle]} />
      <View style={[styles.fill, kind === 'dialog' && styles.center]} pointerEvents={visible ? 'box-none' : 'none'}>
        {typeof children === 'function' ? children(contentStyle) : (
          <Animated.View style={[styles.dialog, contentStyle]}>{children}</Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { backgroundColor: theme.colors.overlay },
  center: { justifyContent: 'center', alignItems: 'center', padding: theme.spacing.l },
  dialog: { width: '100%', maxWidth: 400 },
});
