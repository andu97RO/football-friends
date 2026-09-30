import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { callFunction, useProfile, usePlayerStats } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { getAuthCallbackUrl, MIN_PASSWORD } from '@/lib/auth-utils';
import { useGroups } from '@/lib/groups';
import { LocalePreference, useLocaleStore, useT } from '@/lib/i18n';
import { confirm, showAlert } from '@/lib/alert';
import { showToast } from '@/lib/toast';
import { scheduleLocalTestNotificationAsync, unregisterPushNotifications } from '@/lib/notifications';
import { Profile } from '@/lib/types';
import {
  Avatar, Button, Card, ChoiceChip, ErrorState, Field, ListGroup, ListRow, LoadingState, PasswordField, ratingLabel,
  Screen, ScreenHeader, SectionHeader, Segmented, Sheet, Txt,
} from '@/components/ui';

type NotifyKey = 'notify_waitlist' | 'notify_teams' | 'notify_chat' | 'notify_matches';

export default function ProfileScreen() {
  const t = useT();
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const profile = useProfile();
  const groups = useGroups();
  const preference = useLocaleStore((s) => s.preference);
  const setPreference = useLocaleStore((s) => s.setPreference);
  const [groupId, setGroupId] = useState<string | undefined>();
  const [sheet, setSheet] = useState<'edit' | 'password' | null>(null);
  const group = groups.approved.find((g) => g.club_id === groupId) ?? groups.approved[0];
  const stats = usePlayerStats(group?.club_id);

  const updatePrefs = useMutation({
    mutationFn: async (patch: Partial<Record<NotifyKey, boolean>>) => {
      const { error } = await supabase.from('profile').update(patch).eq('user_id', session!.user.id);
      if (error) throw error;
    },
    onMutate: (patch) => {
      client.setQueryData<Profile>(['profile', session?.user.id], (old) => (old ? { ...old, ...patch } : old));
    },
    onError: (error: Error) => {
      void client.invalidateQueries({ queryKey: ['profile'] });
      showAlert(t('common.errorTitle'), error.message);
    },
  });

  const signOut = async () => {
    const ok = await confirm({ title: t('profile.signOutTitle'), cancelLabel: t('common.cancel'), confirmLabel: t('profile.signOut') });
    if (!ok) return;
    // Clear the push token so the next person on this device doesn't get this account's notifications.
    if (session?.user.id) await unregisterPushNotifications(session.user.id);
    client.clear();
    await supabase.auth.signOut();
    setSession(null);
  };

  // P4: in-app account deletion (App Store guideline 5.1.1(v)).
  const deleteAccount = async () => {
    const ok = await confirm({
      title: t('profile.deleteTitle'),
      message: t('profile.deleteBody'),
      cancelLabel: t('profile.keepAccount'),
      confirmLabel: t('profile.deleteConfirm'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await callFunction('delete-account', {});
      client.clear();
      await supabase.auth.signOut({ scope: 'local' });
      setSession(null);
      showToast(t('profile.deleted'));
    } catch (error) {
      showAlert(t('common.errorTitle'), error instanceof Error ? error.message : String(error));
    }
  };

  const testNotification = async () => {
    const result = await scheduleLocalTestNotificationAsync({ title: t('app.name'), body: t('profile.testNotificationBody'), secondsFromNow: 2 });
    showToast(result.success ? t('profile.testNotificationSent') : result.error ?? t('common.errorTitle'), { tone: result.success ? 'default' : 'error' });
  };

  const header = <ScreenHeader title={t('tabs.profile')} />;
  if (profile.isLoading) return <Screen header={header} tabBar><LoadingState /></Screen>;
  if (profile.error || !profile.data) return <Screen header={header} tabBar><ErrorState error={profile.error} onRetry={() => profile.refetch()} /></Screen>;
  const me = profile.data;
  const s = stats.data;

  return (
    <Screen header={header} tabBar testID="profile-screen">
      {/* P2: one way to edit the profile; no duplicate pencil on the avatar. */}
      <View style={styles.head}>
        <View style={styles.ring}>
          <Avatar name={me.display_name} url={me.avatar_url} seed={me.user_id} size={76} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title" numberOfLines={2}>{me.display_name}</Txt>
          <Txt variant="caption" tone="secondary" numberOfLines={1}>{session?.user.email}</Txt>
        </View>
      </View>
      <Button title={t('profile.edit')} icon="create-outline" variant="secondary" onPress={() => setSheet('edit')} testID="edit-profile" />

      {group && (
        <>
          {groups.approved.length > 1 && (
            <View style={styles.chips}>
              {groups.approved.map((g) => (
                <ChoiceChip key={g.club_id} label={g.name} selected={g.club_id === group.club_id} onPress={() => setGroupId(g.club_id)} />
              ))}
            </View>
          )}
          {/* P1: one format (whole numbers out of 5) and one line on who sets it. */}
          <Card style={{ gap: 6 }} testID="rating-card">
            <Txt variant="label" tone="secondary">{t('profile.ratingIn', { group: group.name })}</Txt>
            <Txt variant="hero">{ratingLabel(group.rating)}</Txt>
            <Txt variant="caption" tone="secondary">{t('rating.modelShort')}</Txt>
          </Card>
          <View style={styles.stats}>
            <Stat value={s ? String(s.games) : '–'} label={t('profile.games')} />
            <Stat value={s ? String(s.wins) : '–'} label={t('profile.wins')} />
            <Stat value={s ? String(s.motm) : '–'} label={t('profile.motm')} />
            <Stat value={s?.showed_up !== null && s?.showed_up !== undefined ? `${s.showed_up}%` : '–'} label={t('profile.showedUp')} />
          </View>
          <Card style={styles.form}>
            <Txt variant="label" tone="secondary" style={{ flex: 1 }}>{t('profile.form')}</Txt>
            {s && s.form.length > 0 ? (
              s.form.map((r, i) => (
                <View key={i} style={[styles.formChip, r === 'W' ? styles.win : r === 'L' ? styles.loss : styles.draw]} accessibilityLabel={t(`profile.result${r}`)}>
                  <Txt variant="number" style={{ fontSize: 16, color: r === 'W' ? theme.colors.success : r === 'L' ? theme.colors.error : theme.colors.textSecondary }}>{t(`profile.short${r}`)}</Txt>
                </View>
              ))
            ) : (
              <Txt variant="caption" tone="muted">{t('profile.noForm')}</Txt>
            )}
          </Card>
        </>
      )}

      {/* P3: separate switches, plain names; the test sender is a developer tool. */}
      <SectionHeader title={t('profile.notifications')} />
      {Platform.OS === 'web' && <Txt variant="caption" tone="muted">{t('profile.notificationsWeb')}</Txt>}
      <ListGroup>
        {(['notify_waitlist', 'notify_teams', 'notify_matches', 'notify_chat'] as NotifyKey[]).map((key) => (
          <ListRow
            key={key}
            kind="toggle"
            title={t(`profile.${key}`)}
            subtitle={t(`profile.${key}_help`)}
            toggled={me[key] !== false}
            onToggle={(value) => updatePrefs.mutate({ [key]: value })}
            testID={key}
          />
        ))}
        {__DEV__ && Platform.OS !== 'web' && <ListRow kind="action" icon="bug-outline" title={t('profile.testNotification')} onPress={testNotification} />}
      </ListGroup>

      <SectionHeader title={t('profile.language')} />
      <Segmented<LocalePreference>
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'system', label: t('profile.languageSystem') },
          { value: 'en', label: 'English' },
          { value: 'ro', label: 'Română' },
        ]}
      />

      <SectionHeader title={t('profile.account')} />
      <ListGroup>
        <ListRow icon="key-outline" title={t('profile.changePassword')} onPress={() => setSheet('password')} testID="change-password" />
        <ListRow kind="action" icon="log-out-outline" title={t('profile.signOut')} onPress={signOut} testID="sign-out" />
        <ListRow kind="action" icon="trash-outline" tone="danger" title={t('profile.deleteAccount')} onPress={deleteAccount} testID="delete-account" />
      </ListGroup>

      <EditProfileSheet visible={sheet === 'edit'} onClose={() => setSheet(null)} profile={me} />
      <ChangePasswordSheet visible={sheet === 'password'} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="number">{value}</Txt>
      <Txt variant="label" tone="secondary" style={{ fontSize: 10 }} numberOfLines={2}>{label}</Txt>
    </View>
  );
}

function EditProfileSheet(props: { visible: boolean; onClose: () => void; profile: Profile }) {
  return props.visible ? <OpenEditProfileSheet {...props} /> : null;
}

// Mounted per opening, so background refetches never overwrite edits in progress.
function OpenEditProfileSheet({ visible, onClose, profile }: { visible: boolean; onClose: () => void; profile: Profile }) {
  const t = useT();
  const client = useQueryClient();
  const [name, setName] = useState(profile.display_name);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('profile').update({ display_name: name.trim(), avatar_url: avatar }).eq('user_id', profile.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['profile'] });
      void client.invalidateQueries({ queryKey: ['feed'] });
      onClose();
      showToast(t('profile.saved'));
    },
    onError: (error: Error) => showAlert(t('common.errorTitle'), error.message),
  });

  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploading(true);
      const blob = await (await fetch(result.assets[0].uri)).blob();
      if (blob.size > 2 * 1024 * 1024) throw new Error(t('profile.photoTooBig'));
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      if (!extensions[blob.type]) throw new Error(t('profile.photoType'));
      const path = `${profile.user_id}/${Date.now()}.${extensions[blob.type]}`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) throw error;
      setAvatar(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch (error) {
      showAlert(t('common.errorTitle'), error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('profile.edit')}
      testID="edit-profile-sheet"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title={t('common.cancel')} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button title={t('common.save')} onPress={() => save.mutate()} loading={save.isPending} disabled={!name.trim() || uploading} style={{ flex: 2 }} testID="save-profile" />
        </View>
      }
    >
      <View style={styles.head}>
        <View style={styles.ring}>
          <Avatar name={name} url={avatar} seed={profile.user_id} size={76} />
        </View>
        <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
          <Button title={t('profile.changePhoto')} icon="camera-outline" variant="secondary" size="m" onPress={pick} loading={uploading} />
          {/* P5: only offer removal when there is a photo, with a full-size target. */}
          {avatar && <Button title={t('profile.removePhoto')} variant="dangerGhost" size="m" onPress={() => setAvatar(null)} />}
        </View>
      </View>
      <Field label={t('auth.displayName')} helper={t('profile.displayNameHelp')} value={name} onChangeText={setName} maxLength={40} testID="display-name-input" />
    </Sheet>
  );
}

/** P6: the current password is required; same label as every password form. */
function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const session = useAuthStore((s) => s.session);
  const email = session?.user.email ?? '';
  const hasPassword = (session?.user.identities ?? []).some((i) => i.provider === 'email') || session?.user.app_metadata?.provider === 'email';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCurrent('');
      setNext('');
      setError(null);
    }
  }, [visible]);

  const save = async () => {
    setError(null);
    if (hasPassword && !current) return setError(t('profile.enterCurrent'));
    if (next.length < MIN_PASSWORD) return setError(t('auth.passwordTooShort', { count: MIN_PASSWORD }));
    setLoading(true);
    try {
      if (hasPassword) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
        if (verifyError) throw new Error(t('profile.currentWrong'));
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      showToast(t('auth.passwordUpdated'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getAuthCallbackUrl({ type: 'recovery' }) });
    if (resetError) showAlert(t('common.errorTitle'), resetError.message);
    else showToast(t('profile.resetSent', { email }));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={hasPassword ? t('profile.changePassword') : t('profile.setPassword')} subtitle={t('auth.passwordRule', { count: MIN_PASSWORD })} testID="password-sheet">
      {hasPassword && (
        <PasswordField label={t('profile.currentPassword')} value={current} onChangeText={setCurrent} autoComplete="password" textContentType="password" testID="current-password" />
      )}
      <PasswordField label={t('auth.newPassword')} placeholder={t('auth.passwordNewPlaceholder')} value={next} onChangeText={setNext} autoComplete="password-new" textContentType="newPassword" testID="new-password" />
      {error && <Txt variant="body" tone="error" accessibilityRole="alert">{error}</Txt>}
      <Button title={t('auth.updatePassword')} onPress={save} loading={loading} testID="update-password" />
      {hasPassword && <Button title={t('profile.forgotCurrent')} variant="link" size="m" onPress={sendReset} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: { padding: 3, borderRadius: 44, borderWidth: 2, borderColor: theme.colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    flexGrow: 1, flexBasis: '45%', minHeight: 76, padding: 14, gap: 2, borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  form: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formChip: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  win: { backgroundColor: theme.colors.successTint },
  loss: { backgroundColor: theme.colors.errorTint },
  draw: { backgroundColor: theme.colors.surfaceRaised },
});
