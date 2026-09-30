import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link' | 'danger' | 'dangerGhost';

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: theme.colors.primary, fg: theme.colors.onPrimary, border: theme.colors.primary },
  secondary: { bg: theme.colors.surfaceRaised, fg: theme.colors.text, border: theme.colors.borderStrong },
  ghost: { bg: 'transparent', fg: theme.colors.text, border: 'transparent' },
  link: { bg: 'transparent', fg: theme.colors.primaryText, border: 'transparent' },
  danger: { bg: theme.colors.errorTint, fg: theme.colors.error, border: 'transparent' },
  dangerGhost: { bg: 'transparent', fg: theme.colors.error, border: 'transparent' },
};

/** Buttons use sentence case everywhere (review: mixed casing). */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  size = 'l',
  style,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'm' | 'l';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const colors = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'l' ? styles.large : styles.medium,
        { backgroundColor: colors.bg, borderColor: colors.border },
        inactive && styles.disabled,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons name={icon} size={18} color={colors.fg} />}
          <Text numberOfLines={1} style={[styles.text, size === 'm' && styles.textMedium, { color: colors.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.m,
  },
  large: { minHeight: 54 },
  medium: { minHeight: theme.hitTarget },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: theme.fonts.heavy, fontSize: 16 },
  textMedium: { fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
