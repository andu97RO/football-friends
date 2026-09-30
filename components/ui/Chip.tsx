import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@/constants/theme';
import { Txt } from './Text';

type Tone = 'open' | 'warning' | 'neutral' | 'error' | 'success';

const tones: Record<Tone, string> = {
  open: theme.colors.primaryText,
  warning: theme.colors.warning,
  neutral: theme.colors.textSecondary,
  error: theme.colors.error,
  success: theme.colors.success,
};

/** M15: a status label, not a button. A dot and text, no fill or border. */
export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View style={styles.status} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: tones[tone] }]} />
      <Txt variant="label" style={{ color: tones[tone] }}>{label}</Txt>
    </View>
  );
}

/** Selectable pill for choices such as filters or tabs. */
export function ChoiceChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      testID={testID}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Txt variant="bodyStrong" style={{ color: selected ? theme.colors.text : theme.colors.textSecondary }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  choice: {
    minHeight: theme.hitTarget,
    paddingHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { borderColor: theme.colors.text, backgroundColor: theme.colors.surfaceRaised },
});
