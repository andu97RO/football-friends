import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { Txt } from '@/components/ui';

// Pause queries while offline and refetch when the connection returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false))
);

export default function OfflineBanner() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityRole="alert" testID="offline-banner">
      <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.onPrimary} />
      <Txt variant="caption" style={styles.text}>{t('common.offline')}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingBottom: 6, backgroundColor: theme.colors.warning,
  },
  text: { color: theme.colors.onPrimary, fontFamily: theme.fonts.bold },
});
