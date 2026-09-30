import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Txt } from './Text';

/**
 * One row in a settings-style list. Navigation rows get a chevron, actions do not
 * (review M16: an action must not carry a navigation chevron).
 */
export function ListRow({
  title,
  subtitle,
  icon,
  value,
  onPress,
  kind = 'navigate',
  toggled,
  onToggle,
  tone = 'default',
  testID,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  value?: string;
  onPress?: () => void;
  kind?: 'navigate' | 'action' | 'toggle' | 'static';
  toggled?: boolean;
  onToggle?: (value: boolean) => void;
  tone?: 'default' | 'danger';
  testID?: string;
  disabled?: boolean;
}) {
  const color = tone === 'danger' ? theme.colors.error : theme.colors.text;
  const content = (
    <>
      {icon && <Ionicons name={icon} size={20} color={tone === 'danger' ? theme.colors.error : theme.colors.textSecondary} />}
      <View style={styles.text}>
        <Txt variant="bodyStrong" style={{ color }}>{title}</Txt>
        {subtitle && <Txt variant="caption" tone="secondary">{subtitle}</Txt>}
      </View>
      {value && <Txt variant="body" tone="secondary">{value}</Txt>}
      {kind === 'toggle' && (
        <Switch
          value={!!toggled}
          onValueChange={onToggle}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
          thumbColor={theme.colors.text}
          {...({ activeThumbColor: theme.colors.onPrimary } as object)}
        />
      )}
      {kind === 'navigate' && <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
    </>
  );
  if (kind === 'toggle' || kind === 'static' || !onPress) {
    return <View style={styles.row} testID={testID}>{content}</View>;
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID} disabled={disabled} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
      {content}
    </Pressable>
  );
}

export function ListGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: theme.spacing.m, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
});
