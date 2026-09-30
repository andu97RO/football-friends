import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { getAuthCallbackUrl, MIN_PASSWORD } from '@/lib/auth-utils';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { AuthShell, OrDivider, SocialButtons, TextLink } from '@/components/AuthShell';
import { Button, Field, PasswordField, RatingPicker, Txt } from '@/components/ui';

export default function SignUpScreen() {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setError(null);
    if (!name.trim()) return setError(t('auth.enterName'));
    if (!/\S+@\S+\.\S+/.test(email.trim())) return setError(t('auth.enterEmail'));
    if (password.length < MIN_PASSWORD) return setError(t('auth.passwordTooShort', { count: MIN_PASSWORD }));
    if (rating === null) return setError(t('auth.pickRating'));

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: name.trim(), initial_rating: rating },
          emailRedirectTo: getAuthCallbackUrl(),
        },
      });
      if (signUpError) throw signUpError;
      // Email verification is required before the account is usable.
      if (data.session) await supabase.auth.signOut({ scope: 'local' });
      router.replace({ pathname: '/(auth)/check-inbox', params: { kind: 'signup', email: email.trim() } });
    } catch (err: any) {
      setError(err.message || t('auth.signUpFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('auth.createAccountTitle')} subtitle={t('auth.createAccountSubtitle')} testID="sign-up-screen">
      <SocialButtons onError={setError} />
      <OrDivider label={t('auth.orEmail')} />

      <Field
        label={t('auth.displayName')}
        helper={t('profile.displayNameHelp')}
        placeholder={t('auth.displayNamePlaceholder')}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        maxLength={40}
        editable={!loading}
        testID="name-input"
      />
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
        helper={t('auth.passwordRule', { count: MIN_PASSWORD })}
        placeholder={t('auth.passwordNewPlaceholder')}
        value={password}
        onChangeText={setPassword}
        autoComplete="password-new"
        textContentType="newPassword"
        editable={!loading}
        testID="password-input"
      />
      <View style={{ gap: 8 }}>
        <Txt variant="label" tone="secondary">{t('rating.yourSkill')}</Txt>
        <Txt variant="caption" tone="muted">{t('rating.signupHelp')}</Txt>
        <RatingPicker value={rating} onChange={setRating} disabled={loading} />
      </View>

      {error && <Txt variant="body" tone="error" accessibilityRole="alert" testID="auth-error">{error}</Txt>}
      <Button title={t('auth.createAccount')} onPress={handleSignUp} loading={loading} testID="create-account-button" />
      <TextLink prefix={t('auth.haveAccount')} label={t('auth.signIn')} onPress={() => router.replace('/(auth)/login')} testID="sign-in-link" />
    </AuthShell>
  );
}
