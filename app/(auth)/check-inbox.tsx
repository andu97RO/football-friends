import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getAuthCallbackUrl, isVerifiedSession } from '@/lib/auth-utils';
import { useAuthStore } from '@/lib/auth-store';
import { ensureProfile } from '@/lib/ensure-profile';
import { requestEmailCode, emailAuthError } from '@/lib/email-auth';
import { useT } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, Txt } from '@/components/ui';

type Kind = 'reset' | 'magic' | 'otp' | 'signup';

/** Passwordless code entry, plus the existing signup/recovery inbox screens. */
export default function CheckInboxScreen() {
  const router = useRouter();
  const t = useT();
  const { kind = 'otp', email = '' } = useLocalSearchParams<{ kind?: Kind; email?: string }>();
  const isCode = kind === 'otp' || kind === 'magic';
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(60);
  const resendAt = useRef(Date.now() + 60_000);
  const busy = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((resendAt.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, []);

  const verify = async () => {
    if (busy.current || !email) return;
    setError(null);
    if (!/^\d{6,10}$/.test(token.trim())) {
      setError(t('auth.enterCode'));
      return;
    }
    busy.current = true;
    setVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
      if (error) throw error;
      if (!isVerifiedSession(data.session)) throw new Error(t('auth.confirmEmailFirst'));
      // The DB trigger creates profiles on signup; this also repairs older missing rows.
      await ensureProfile(data.session.user.id, data.session.user.email);
      useAuthStore.getState().setSession(data.session);
      router.replace('/(tabs)/matches');
    } catch (err: unknown) {
      setError(emailAuthError(err));
    } finally {
      busy.current = false;
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (busy.current || remaining > 0 || !email) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      if (isCode) {
        await requestEmailCode(email);
        setToken('');
      } else {
        const redirect = getAuthCallbackUrl(kind === 'reset' ? { type: 'recovery' } : undefined);
        const { error } = kind === 'reset'
          ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
          : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
      }
      resendAt.current = Date.now() + 60_000;
      setRemaining(60);
      showToast(t('auth.linkResent'));
    } catch (err: unknown) {
      setError(emailAuthError(err));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  return (
    <AuthShell icon="mail-open-outline" title={t(isCode ? 'auth.codeTitle' : 'auth.checkInbox')} subtitle={t(`auth.checkInbox_${isCode ? 'otp' : kind}`, { email })} testID="check-inbox-screen">
      {isCode && (
        <>
          <Field
            label={t('auth.codeLabel')}
            placeholder={t('auth.codePlaceholder')}
            value={token}
            onChangeText={setToken}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            editable={!verifying && !sending}
            returnKeyType="go"
            onSubmitEditing={verify}
            testID="email-code-input"
          />
          <Button title={t('auth.verifyCode')} onPress={verify} loading={verifying} disabled={sending || !email} testID="verify-code-button" />
        </>
      )}
      {error && <Txt variant="body" tone="error" accessibilityRole="alert" testID="auth-error">{error}</Txt>}
      <Txt variant="body" tone="secondary">{t('auth.checkSpam')}</Txt>
      <Button title={t('auth.backToSignIn')} onPress={() => router.replace('/(auth)/login')} disabled={sending || verifying} testID="back-to-sign-in" />
      <Button title={remaining > 0 ? t('auth.resendIn', { seconds: remaining }) : t(isCode ? 'auth.resendCode' : 'auth.resend')} variant="secondary" onPress={resend} loading={sending} disabled={!email || remaining > 0 || verifying} testID="resend-email" />
    </AuthShell>
  );
}
