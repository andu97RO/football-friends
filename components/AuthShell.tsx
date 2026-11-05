import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { isNativeAppleSignInAvailable, signInWithAppleNative, signInWithProvider, OAuthProvider } from '@/lib/oauth';
import { appUrl } from '@/lib/utils';
import { Button, Screen, ScreenHeader, Txt } from '@/components/ui';

/** Auth pages: back button, big title, and fields that stay clear of the keyboard (A7). */
export function AuthShell({
  title,
  subtitle,
  back = true,
  icon,
  brand,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  brand?: boolean;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={back ? <ScreenHeader back /> : undefined} testID={testID} contentStyle={styles.content}>
        {brand && (
          <View style={styles.brand} accessibilityElementsHidden importantForAccessibility="no">
            <Ionicons name="football-outline" size={30} color={theme.colors.onPrimary} />
          </View>
        )}
        {icon && (
          <View style={styles.icon}>
            <Ionicons name={icon} size={26} color={theme.colors.primaryText} />
          </View>
        )}
        <View style={{ gap: 6 }}>
          <Txt variant="display" accessibilityRole="header">{title}</Txt>
          {subtitle && <Txt variant="body" tone="secondary">{subtitle}</Txt>}
        </View>
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/**
 * A1: Apple and Google buttons. Errors are reported through onError.
 * Sign in with Apple uses the iOS system sheet and only shows on iOS, where
 * App Store guideline 4.8 requires it next to Google.
 */
export function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void isNativeAppleSignInAvailable().then((available) => live && setAppleAvailable(available));
    return () => { live = false; };
  }, []);
  const start = async (provider: OAuthProvider) => {
    if (busy) return;
    setBusy(provider);
    try {
      if (provider === 'apple') await signInWithAppleNative();
      else await signInWithProvider(provider);
    } catch (error) {
      onError(error instanceof Error ? error.message : t('auth.oauthFailed'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={theme.borderRadius.m}
          style={styles.appleButton}
          onPress={() => start('apple')}
          accessibilityLabel={t('auth.continueApple')}
          testID="apple-sign-in"
        />
      )}
      <Button title={t('auth.continueGoogle')} icon="logo-google" variant="secondary" loading={busy === 'google'} disabled={!!busy} onPress={() => start('google')} testID="google-sign-in" />
    </View>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <Txt variant="caption" tone="muted">{label}</Txt>
      <View style={styles.line} />
    </View>
  );
}

/** A2: inline text link with a full 44pt hit area. */
export function TextLink({ prefix, label, onPress, testID }: { prefix?: string; label: string; onPress: () => void; testID?: string }) {
  return (
    <View style={styles.linkRow}>
      {prefix && <Txt variant="body" tone="secondary">{prefix}</Txt>}
      <Button title={label} variant="link" size="m" onPress={onPress} testID={testID} style={styles.link} />
    </View>
  );
}

/** Terms and privacy links shown wherever an account can be created (email or Google). */
export function LegalNote() {
  const t = useT();
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="caption" tone="muted" style={{ textAlign: 'center' }}>{t('auth.legalNote')}</Txt>
      <View style={styles.linkRow}>
        <Button title={t('legal.terms')} variant="link" size="m" onPress={() => Linking.openURL(appUrl('/terms.html'))} style={styles.link} testID="terms-link" />
        <Button title={t('legal.privacy')} variant="link" size="m" onPress={() => Linking.openURL(appUrl('/privacy.html'))} style={styles.link} testID="privacy-link" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same height as the large Google button beside it.
  appleButton: { width: '100%', height: 54 },
  content: { gap: theme.spacing.l, paddingTop: theme.spacing.l },
  icon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1,
    borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center',
  },
  brand: { width: 60, height: 60, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  link: { paddingHorizontal: 8 },
});
