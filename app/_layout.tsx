// Import polyfills first before any other imports
import '@/lib/polyfills';
import 'react-native-url-polyfill/auto';

import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { LogBox, Platform, StatusBar } from 'react-native';
import Constants from 'expo-constants';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { registerForPushNotificationsAsync, setupNotificationHandler } from '@/lib/notifications';
import { isVerifiedSession } from '@/lib/auth-utils';

// Ignore specific warnings
LogBox.ignoreLogs(['Warning: ...']); // Add specific warnings to ignore

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function RootLayout() {
  const { setSession, session } = useAuthStore();

  useEffect(() => {
    // Load session on app start
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes globally
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    // Set up notification handler
    setupNotificationHandler();

    // Register for push notifications when user is logged in
    if (isVerifiedSession(session)) {
      registerForPushNotificationsAsync(session.user.id).catch((error) => {
        console.error('Error registering for push notifications:', error);
      });
    }
  }, [session]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="match/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="teams/[id]" options={{ title: 'Teams', headerTransparent: true, headerTintColor: '#fff' }} />
      </Stack>
    </QueryClientProvider>
  );
}
