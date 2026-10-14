import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { Txt } from './Text';

/** Bottom sheet with a drag-handle look. Content scrolls and stays above the keyboard. */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} testID={testID} accessibilityViewIsModal>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} bounces={false}>
            <Txt variant="title" accessibilityRole="header">{title}</Txt>
            {subtitle && <Txt variant="body" tone="secondary" style={{ marginTop: 4 }}>{subtitle}</Txt>}
            <View style={styles.body}>{children}</View>
            {footer && <View style={styles.footer}>{footer}</View>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderStrong, marginTop: 10 },
  content: { padding: theme.spacing.l, paddingTop: theme.spacing.m },
  body: { marginTop: theme.spacing.m, gap: theme.spacing.m },
  footer: { marginTop: theme.spacing.l, gap: theme.spacing.s },
});
