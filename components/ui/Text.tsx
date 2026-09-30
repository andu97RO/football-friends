import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

type Variant = 'hero' | 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'number';
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'error' | 'warning' | 'success' | 'onPrimary';

const toneColor: Record<Tone, string> = {
  default: theme.colors.text,
  secondary: theme.colors.textSecondary,
  muted: theme.colors.textMuted,
  primary: theme.colors.primaryText,
  error: theme.colors.error,
  warning: theme.colors.warning,
  success: theme.colors.success,
  onPrimary: theme.colors.onPrimary,
};

export function Txt({ variant = 'body', tone = 'default', style, ...props }: TextProps & { variant?: Variant; tone?: Tone }) {
  return <RNText {...props} style={[styles[variant], { color: toneColor[tone] }, style]} />;
}

const styles = StyleSheet.create({
  hero: { fontFamily: theme.fonts.display, fontSize: 52, lineHeight: 52, textTransform: 'uppercase', letterSpacing: 0.3 },
  display: { fontFamily: theme.fonts.display, fontSize: 38, lineHeight: 40, textTransform: 'uppercase', letterSpacing: 0.3 },
  title: { fontFamily: theme.fonts.display, fontSize: 28, lineHeight: 30, textTransform: 'uppercase', letterSpacing: 0.3 },
  heading: { fontFamily: theme.fonts.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: theme.fonts.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: theme.fonts.heavy, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' },
  number: { fontFamily: theme.fonts.display, fontSize: 30, lineHeight: 32 },
});
