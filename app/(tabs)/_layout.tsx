import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { useProfile } from '@/lib/api';
import { useGroups } from '@/lib/groups';
import { useT } from '@/lib/i18n';
import { loadPendingInvite, usePendingInvite } from '@/lib/invite';
import { LoadingState, Txt } from '@/components/ui';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  matches: 'football-outline',
  groups: 'people-outline',
  profile: 'person-outline',
};

/** M7: every tab shows its label; the active one sits in the lime pill. */
function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const badge = options.tabBarBadge as number | undefined;
          const label = String(options.title ?? route.name);
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${label}, ${badge}` : label}
              testID={`tab-${route.name}`}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <View>
                <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={20} color={focused ? theme.colors.onPrimary : theme.colors.textSecondary} />
                {!!badge && (
                  <View style={styles.badge}>
                    <Txt style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Txt>
                  </View>
                )}
              </View>
              <Txt variant="caption" style={[styles.label, { color: focused ? theme.colors.onPrimary : theme.colors.textSecondary }]}>{label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const t = useT();
  const { session } = useAuthStore();
  const isAuthed = isVerifiedSession(session);
  const profile = useProfile();
  const { pendingRequests } = useGroups();
  const pendingInvite = usePendingInvite((s) => s.code);

  useEffect(() => {
    void loadPendingInvite();
  }, []);

  // `undefined` means the stored session is still being restored. Redirecting
  // in that window would bounce every hard refresh and deep link on web.
  if (session === undefined) return <LoadingState />;
  if (!isAuthed) return <Redirect href="/(auth)/login" />;
  if (profile.data && profile.data.onboarded === false) return <Redirect href="/onboarding" />;
  if (pendingInvite) return <Redirect href={{ pathname: '/join/[code]', params: { code: pendingInvite } }} />;

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.background } }}>
      <Tabs.Screen name="matches" options={{ title: t('tabs.matches') }} />
      {/* G4: admins see open join requests from anywhere in the app. */}
      <Tabs.Screen name="groups" options={{ title: t('tabs.groups'), tabBarBadge: pendingRequests || undefined }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 480,
    padding: 6,
    gap: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  tab: { flex: 1, minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabActive: { backgroundColor: theme.colors.primary },
  label: { fontFamily: theme.fonts.bold, fontSize: 12, lineHeight: 15 },
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: theme.colors.warning, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: theme.fonts.heavy, fontSize: 11, lineHeight: 14, color: theme.colors.onPrimary },
});
