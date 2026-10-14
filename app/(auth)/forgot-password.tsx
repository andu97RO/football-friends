import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getAuthCallbackUrl } from '@/lib/auth-utils';
import { useT } from '@/lib/i18n';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Txt } from '@/components/ui';

/** A6: the "enter your email" step of password reset. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    if (!/\S+@\S+\.\S+/.test(email.trim())) return setError(t('auth.enterEmail'));
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthCallbackUrl({ type: 'recovery' }),
      });
      if (error) throw error;
      router.replace({ pathname: '/(auth)/check-inbox', params: { kind: 'reset', email: email.trim() } });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell icon="key-outline" title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} testID="forgot-password-screen">
      <Field
        label={t('auth.email')}
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={send}
        testID="email-input"
      />
      {error && <Txt variant="body" tone="error" accessibilityRole="alert">{error}</Txt>}
      <Button title={t('auth.sendResetLink')} onPress={send} loading={loading} testID="send-reset-button" />
    </AuthShell>
  );
}
