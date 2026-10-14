import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@/constants/theme';
import { Txt } from './Text';

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.item, selected && styles.selected]}
          >
            <Txt variant="bodyStrong" style={{ color: selected ? theme.colors.text : theme.colors.textSecondary }}>{option.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  item: { flex: 1, minHeight: 40, borderRadius: theme.borderRadius.s, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.borderStrong },
});
