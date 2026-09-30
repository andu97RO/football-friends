import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Txt } from './Text';

/** 44pt round control. Always pass an accessibilityLabel; icons are never the only cue for key actions. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  badge,
  variant = 'surface',
  style,
  testID,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  badge?: number;
  variant?: 'surface' | 'primary' | 'plain';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? theme.colors.primary : variant === 'plain' ? 'transparent' : theme.colors.surfaceRaised;
  const fg = variant === 'primary' ? theme.colors.onPrimary : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.button, { backgroundColor: bg }, variant === 'surface' && styles.bordered, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }, style]}
    >
      <Ionicons name={icon} size={20} color={fg} />
      {!!badge && badge > 0 && (
        <View style={styles.badge}>
          <Txt variant="caption" tone="onPrimary" style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Txt>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: theme.hitTarget, height: theme.hitTarget, borderRadius: theme.hitTarget / 2, alignItems: 'center', justifyContent: 'center' },
  bordered: { borderWidth: 1, borderColor: theme.colors.border },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: theme.colors.warning, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: theme.fonts.heavy, fontSize: 11, lineHeight: 14 },
});
