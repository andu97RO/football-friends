import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { rpc, useProfile } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { useT } from '@/lib/i18n';
import { AuthShell } from '@/components/AuthShell';
import { Button, Field, LoadingState, RatingPicker, Txt } from '@/components/ui';

/**
 * A3: players who arrive by magic link or Apple/Google have never been asked
 * their name. Ask once, with the self-rating, before showing the app.
 */
export default function OnboardingScreen() {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const profile = useProfile();
  const [name, setName] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session === undefined || profile.isLoading) return <LoadingState />;
  if (!isVerifiedSession(session)) return <Redirect href="/(auth)/login" />;
  if (profile.data?.onboarded) return <Redirect href="/(tabs)/matches" />;

  const save = async () => {
    setError(null);
    const finalName = name.trim() || profile.data?.display_name || '';
    if (!finalName) return setError(t('auth.enterName'));
    if (rating === null) return setError(t('auth.pickRating'));
    setSaving(true);
    try {
      await rpc('complete_onboarding', { name: finalName, rating });
      await client.invalidateQueries({ queryKey: ['profile'] });
      router.replace('/(tabs)/matches');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell back={false} brand title={t('onboarding.title')} subtitle={t('onboarding.subtitle')} testID="onboarding-screen">
      <Field
        label={t('auth.displayName')}
        helper={t('profile.displayNameHelp')}
        placeholder={profile.data?.display_name || t('auth.displayNamePlaceholder')}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        maxLength={40}
        testID="name-input"
      />
      <View style={{ gap: 8 }}>
        <Txt variant="label" tone="secondary">{t('rating.yourSkill')}</Txt>
        <Txt variant="caption" tone="muted">{t('rating.signupHelp')}</Txt>
        <RatingPicker value={rating} onChange={setRating} />
      </View>
      {error && <Txt variant="body" tone="error" accessibilityRole="alert">{error}</Txt>}
      <Button title={t('onboarding.continue')} onPress={save} loading={saving} testID="onboarding-continue" />
    </AuthShell>
  );
}
