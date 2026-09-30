import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { Txt } from './Text';

type FieldProps = TextInputProps & {
  label?: string;
  helper?: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, helper, error, icon, style, ...props }, ref) {
  return (
    <View style={styles.wrap}>
      {label && <Txt variant="label" tone="secondary" style={styles.label}>{label}</Txt>}
      <View style={[styles.box, !!error && styles.boxError]}>
        {icon && <Ionicons name={icon} size={18} color={theme.colors.textMuted} />}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
          {...props}
          style={[styles.input, props.multiline && styles.multiline, style]}
        />
      </View>
      {error ? <Txt variant="caption" tone="error" accessibilityRole="alert">{error}</Txt> : helper ? <Txt variant="caption" tone="muted">{helper}</Txt> : null}
    </View>
  );
});

/** A4: one password field with a show/hide eye, used on every password form. */
export const PasswordField = forwardRef<TextInput, FieldProps>(function PasswordField({ label, helper, error, ...props }, ref) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.wrap}>
      {label && <Txt variant="label" tone="secondary" style={styles.label}>{label}</Txt>}
      <View style={[styles.box, !!error && styles.boxError]}>
        <TextInput
          ref={ref}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel={props.accessibilityLabel ?? label}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          secureTextEntry={!visible}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          onPress={() => setVisible((v) => !v)}
          style={styles.eye}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      {error ? <Txt variant="caption" tone="error" accessibilityRole="alert">{error}</Txt> : helper ? <Txt variant="caption" tone="muted">{helper}</Txt> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { marginTop: 4 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingLeft: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  boxError: { borderColor: theme.colors.error },
  input: {
    flex: 1,
    minHeight: 50,
    paddingRight: theme.spacing.m,
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
    fontSize: 16,
  },
  multiline: { minHeight: 88, paddingTop: 14, textAlignVertical: 'top' },
  eye: { width: theme.hitTarget + 4, height: 50, alignItems: 'center', justifyContent: 'center' },
});
