import { Pressable, StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';
import { Txt } from './Text';

/** Cards carry a visible border so they separate from the background in daylight. */
export function Card({ style, onPress, highlight, children, ...props }: ViewProps & { onPress?: () => void; highlight?: boolean }) {
  const cardStyle: StyleProp<ViewStyle> = [styles.card, highlight && styles.highlight, style];
  if (!onPress) return <View {...props} style={cardStyle}>{children}</View>;
  return (
    <Pressable {...props} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, right, style }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <Txt variant="label" tone="secondary">{title}</Txt>
      {right}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.m,
  },
  highlight: { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceRaised },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.l, marginBottom: theme.spacing.s },
  divider: { height: 1, backgroundColor: theme.colors.border },
});
