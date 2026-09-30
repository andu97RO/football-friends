import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getAuthCallbackUrl } from '@/lib/auth-utils';
import { useT } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import { AuthShell } from '@/components/AuthShell';
import { Button, Txt } from '@/components/ui';

type Kind = 'reset' | 'magic' | 'signup';

/** A6: "check your inbox" after requesting a reset, a sign-in link or a new account. */
export default function CheckInboxScreen() {
  const router = useRouter();
  const t = useT();
  const { kind = 'magic', email = '' } = useLocalSearchParams<{ kind?: Kind; email?: string }>();
  const [sending, setSending] = useState(false);

  const resend = async () => {
    setSending(true);
    try {
      const redirect = getAuthCallbackUrl(kind === 'reset' ? { type: 'recovery' } : undefined);
      const { error } =
        kind === 'reset'
          ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
          : kind === 'signup'
            ? await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect } })
            : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
      if (error) throw error;
      showToast(t('auth.linkResent'));
    } catch (err: any) {
      showToast(err.message, { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell icon="mail-open-outline" title={t('auth.checkInbox')} subtitle={t(`auth.checkInbox_${kind}`, { email })} testID="check-inbox-screen">
      <Txt variant="body" tone="secondary">{t('auth.checkSpam')}</Txt>
      <Button title={t('auth.backToSignIn')} onPress={() => router.replace('/(auth)/login')} testID="back-to-sign-in" />
      <Button title={t('auth.resend')} variant="secondary" onPress={resend} loading={sending} disabled={!email} />
    </AuthShell>
  );
}
