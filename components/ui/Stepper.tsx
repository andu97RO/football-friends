import { StyleSheet, View } from 'react-native';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { IconButton } from './IconButton';
import { Txt } from './Text';

/** D4 M20: an editable number, styled as a field rather than a read-only stat. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}) {
  const t = useT();
  return (
    <View style={styles.row}>
      <Txt variant="bodyStrong" style={{ flex: 1 }}>{label}</Txt>
      <IconButton icon="remove" accessibilityLabel={t('common.decrease', { label })} disabled={value - step < min} onPress={() => onChange(value - step)} />
      <Txt variant="number" style={styles.value} accessibilityLiveRegion="polite">{format ? format(value) : value}</Txt>
      <IconButton icon="add" accessibilityLabel={t('common.increase', { label })} disabled={value + step > max} onPress={() => onChange(value + step)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    paddingHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  value: { minWidth: 44, textAlign: 'center', fontSize: 26 },
});
