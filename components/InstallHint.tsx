import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { useInstallHint } from '@/lib/pwa';
import { Button, Card, Txt } from '@/components/ui';

/** Web only: invites players to add Football Friends to their home screen so it opens like an app. */
export default function InstallHint() {
  const t = useT();
  const { mode, install, dismiss } = useInstallHint();
  if (!mode) return null;
  return (
    <Card style={styles.card} testID="install-hint">
      <View style={styles.row}>
        <Ionicons name="phone-portrait-outline" size={22} color={theme.colors.primaryText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{t('install.title')}</Txt>
          <Txt variant="caption" tone="secondary">{t(mode === 'prompt' ? 'install.body' : 'install.ios')}</Txt>
        </View>
      </View>
      <View style={styles.actions}>
        {mode === 'prompt' && <Button title={t('install.action')} size="m" onPress={() => void install()} testID="install-app" />}
        <Button title={t('install.dismiss')} size="m" variant="ghost" onPress={dismiss} testID="install-dismiss" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.s },
  actions: { flexDirection: 'row', gap: theme.spacing.s },
});
