import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/lib/auth-store';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Match } from '@/lib/types';
import { isSignupWindowOpen } from '@/lib/utils';
import { isVerifiedSession } from '@/lib/auth-utils';
import { ensureProfile } from '@/lib/ensure-profile';

export default function TabsLayout() {
  const { session } = useAuthStore();
  const isAuthed = isVerifiedSession(session);

  // Ensure profile exists as soon as tabs load (not only on Profile tab)
  const { data: profile } = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      return ensureProfile(session.user.id, session.user.email);
    },
    enabled: isAuthed && !!session?.user?.id,
  });

  // Count open matches for badge (signup window still open)
  const { data: openMatchCount } = useQuery({
    queryKey: ['open-match-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match')
        .select('id, kick_off, signup_open_at, status')
        .gte('kick_off', new Date().toISOString())
        .in('status', ['scheduled']);

      if (error || !data) return 0;
      
      const now = new Date();
      return data.filter(match => isSignupWindowOpen(match as Match, now)).length;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const isAdmin = profile?.is_admin === true;

  if (!isAuthed) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primaryLight,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.colors.background,
          shadowColor: 'transparent', // Remove shadow on iOS
          elevation: 0, // Remove shadow on Android
        },
        headerTintColor: theme.colors.text,
        tabBarStyle: {
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.colors.surface,
          borderTopWidth: 0,
          elevation: 0,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={{ flex: 1 }} />
          ) : undefined
        ),
      }}
    >
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="football" size={size} color={color} />
              {openMatchCount && openMatchCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{openMatchCount > 9 ? '9+' : openMatchCount}</Text>
                </View>
              ) : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
          // Hide the tab for non-admins
          href: isAdmin ? '/admin' : null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -8,
    top: -4,
    backgroundColor: theme.colors.success,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
});
