// Import polyfills first before any other imports
import '@/lib/polyfills';
import 'react-native-url-polyfill/auto';

import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, LogBox, Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import AlertHost from '@/components/AlertHost';
import ToastHost from '@/components/ToastHost';
import OfflineBanner from '@/components/OfflineBanner';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { registerForPushNotificationsAsync, setupNotificationHandler } from '@/lib/notifications';
import { isVerifiedSession } from '@/lib/auth-utils';
import { ensureProfile } from '@/lib/ensure-profile';
import { loadLocalePreference, useLocaleStore } from '@/lib/i18n';

// Ignore specific warnings
LogBox.ignoreLogs(['Warning: ...']); // Add specific warnings to ignore

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60 * 1000,
    },
  },
});

export default function RootLayout() {
  const { setSession, session } = useAuthStore();
  const locale = useLocaleStore((s) => s.locale);
  const [localeReady, setLocaleReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    loadLocalePreference().finally(() => setLocaleReady(true));
  }, []);

  useEffect(() => {
    // Load session on app start
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes globally
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') useAuthStore.getState().setRecovery(true);
      if (useAuthStore.getState().session?.user.id !== session?.user.id) {
        void queryClient.cancelQueries();
        queryClient.clear();
        void supabase.removeAllChannels();
      }
      if (!session) useAuthStore.getState().setRecovery(false);
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    // Set up notification handler
    setupNotificationHandler();

    // Ensure profile exists, then register for push notifications
    if (isVerifiedSession(session)) {
      ensureProfile(session.user.id, session.user.email)
        .then(() => registerForPushNotificationsAsync(session.user.id))
        .catch((error) => {
          console.error('Error ensuring profile / registering push:', error);
        });
    }
  }, [session]);

  // Tapping a push opens the match it is about (its teams or chat where relevant).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { matchId?: string; type?: string } | undefined;
      if (!data?.matchId) return;
      if (data.type === 'chat') router.push(`/match/${data.matchId}/chat`);
      else if (data.type === 'teams') router.push(`/teams/${data.matchId}`);
      else router.push(`/match/${data.matchId}`);
    });
    return () => subscription.remove();
  }, []);

  // Push notifications are written server-side in the player's language.
  const verifiedUserId = isVerifiedSession(session) ? session.user.id : null;
  useEffect(() => {
    if (!verifiedUserId) return;
    supabase.from('profile').update({ locale }).eq('user_id', verifiedUserId).then(({ error }) => {
      if (error) console.warn('Could not save language preference:', error.message);
    });
  }, [verifiedUserId, locale]);

  if ((!fontsLoaded && !fontError) || !localeReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="match/[id]" />
          <Stack.Screen name="match/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="teams/[id]" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="join/[code]" />
        </Stack>
        <OfflineBanner />
        <ToastHost />
        <AlertHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
