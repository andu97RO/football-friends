import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { getAuthCallbackUrl, isVerifiedSession } from '@/lib/auth-utils';
import { useT } from '@/lib/i18n';
import { AuthShell, OrDivider, SocialButtons, TextLink } from '@/components/AuthShell';
import { Button, Field, PasswordField, Txt } from '@/components/ui';

export default function LoginScreen() {
  const router = useRouter();
  const t = useT();
  const { setSession } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'password' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /\S+@\S+\.\S+/.test(email.trim());

  const handlePasswordLogin = async () => {
    setError(null);
    if (!validEmail || !password) {
      setError(t('auth.enterEmailPassword'));
      return;
    }
    setLoading('password');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!isVerifiedSession(data.session)) {
        await supabase.auth.signOut({ scope: 'local' });
        setError(t('auth.confirmEmailFirst'));
        return;
      }
      setSession(data.session);
      router.replace('/(tabs)/matches');
    } catch (err: any) {
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(null);
    }
  };

  // A1: passwordless — one tap from the email opens the app signed in.
  const handleMagicLink = async () => {
    setError(null);
    if (!validEmail) {
      setError(t('auth.enterEmail'));
      return;
    }
    setLoading('link');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: getAuthCallbackUrl(), shouldCreateUser: true },
      });
      if (error) throw error;
      router.push({ pathname: '/(auth)/check-inbox', params: { kind: 'magic', email: email.trim() } });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <AuthShell back={false} brand title={t('app.name')} subtitle={t('auth.tagline')} testID="login-screen">
      <SocialButtons onError={setError} />
      <OrDivider label={t('auth.orEmail')} />

      <Field
        label={t('auth.email')}
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
        testID="email-input"
      />
      <PasswordField
        label={t('auth.password')}
        placeholder={t('auth.passwordPlaceholder')}
        value={password}
        onChangeText={setPassword}
        autoComplete="password"
        textContentType="password"
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={handlePasswordLogin}
        testID="password-input"
      />
      <View style={styles.forgot}>
        <Button
          title={t('auth.forgotPassword')}
          variant="link"
          size="m"
          onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email } })}
          testID="forgot-password"
        />
      </View>

      {error && <Txt variant="body" tone="error" accessibilityRole="alert" testID="auth-error">{error}</Txt>}

      <View style={{ gap: 10 }}>
        <Button title={t('auth.signIn')} onPress={handlePasswordLogin} loading={loading === 'password'} disabled={!!loading} testID="sign-in-button" />
        <Button title={t('auth.emailMeLink')} variant="secondary" icon="mail-outline" onPress={handleMagicLink} loading={loading === 'link'} disabled={!!loading} testID="magic-link-button" />
      </View>

      <TextLink prefix={t('auth.noAccount')} label={t('auth.createAccount')} onPress={() => router.push('/(auth)/sign-up')} testID="sign-up-link" />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginTop: -12 },
});
