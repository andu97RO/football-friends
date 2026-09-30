import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { MIN_PASSWORD } from '@/lib/auth-utils';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { showToast } from '@/lib/toast';
import { AuthShell } from '@/components/AuthShell';
import { Button, PasswordField, Txt } from '@/components/ui';

/** Sets the new password after the emailed reset link (A4: one field with show/hide). */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const t = useT();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(t('auth.passwordTooShort', { count: MIN_PASSWORD }));
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      useAuthStore.getState().setRecovery(false);
      showToast(t('auth.passwordUpdated'));
      router.replace('/(tabs)/matches');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell back={false} icon="lock-closed-outline" title={t('auth.resetTitle')} subtitle={t('auth.passwordRule', { count: MIN_PASSWORD })} testID="reset-password-screen">
      <PasswordField
        label={t('auth.newPassword')}
        placeholder={t('auth.passwordNewPlaceholder')}
        value={password}
        onChangeText={setPassword}
        autoComplete="password-new"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={save}
        testID="new-password-input"
      />
      {error && <Txt variant="body" tone="error" accessibilityRole="alert">{error}</Txt>}
      <Button title={t('auth.updatePassword')} onPress={save} loading={loading} testID="update-password-button" />
    </AuthShell>
  );
}
