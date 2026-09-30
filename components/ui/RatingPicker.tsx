import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { Txt } from './Text';

export const RATING_STEPS = [0, 1, 2, 3, 4, 5] as const;

/**
 * A5 D5 G5 P1: the single rating control used at sign-up, onboarding and in
 * Manage group. Whole numbers 0–5, each step described in words.
 */
export function RatingPicker({ value, onChange, disabled }: { value: number | null; onChange: (value: number) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row} accessibilityRole="radiogroup">
        {RATING_STEPS.map((step) => {
          const selected = value === step;
          return (
            <Pressable
              key={step}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={`${step} · ${t(`rating.step${step}`)}`}
              disabled={disabled}
              onPress={() => onChange(step)}
              testID={`rating-${step}`}
              style={[styles.step, selected && styles.selected]}
            >
              <Txt variant="number" style={{ fontSize: 22, color: selected ? theme.colors.onPrimary : theme.colors.text }}>{step}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt variant="caption" tone={value === null ? 'muted' : 'secondary'} accessibilityLiveRegion="polite">
        {value === null ? t('rating.pickOne') : `${value} · ${t(`rating.step${value}`)}`}
      </Txt>
    </View>
  );
}

/** "4/5" everywhere a single rating is shown. */
export function ratingLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : `${value}/5`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  step: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.borderRadius.s,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
});
