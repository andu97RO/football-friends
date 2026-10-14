import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { Button } from './Button';
import { Txt } from './Text';

export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Txt variant="body" tone="secondary">{label ?? t('common.loading')}</Txt>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const t = useT();
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.icon, { backgroundColor: theme.colors.errorTint }]}>
        <Ionicons name="cloud-offline-outline" size={28} color={theme.colors.error} />
      </View>
      <Txt variant="heading" style={styles.text}>{t('common.errorTitle')}</Txt>
      <Txt variant="body" tone="secondary" style={styles.text}>{message ?? t('common.errorBody')}</Txt>
      {onRetry && <Button title={t('common.retry')} variant="secondary" size="m" onPress={onRetry} style={{ alignSelf: 'center', minWidth: 140 }} />}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.ring}>
        <Ionicons name={icon} size={30} color={theme.colors.primaryText} />
      </View>
      <Txt variant="title" style={styles.text}>{title}</Txt>
      {body && <Txt variant="body" tone="secondary" style={styles.text}>{body}</Txt>}
      {children && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: 12, minHeight: 280 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  text: { textAlign: 'center', maxWidth: 320 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
});
