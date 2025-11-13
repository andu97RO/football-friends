import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { LogBox } from 'react-native';
import OneSignal from 'react-native-onesignal';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

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
  useEffect(() => {
    // Initialize OneSignal
    const oneSignalAppId = Constants.expoConfig?.extra?.oneSignalAppId || process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;

    if (oneSignalAppId) {
      OneSignal.setAppId(oneSignalAppId);

      // Prompt for push on iOS
      OneSignal.promptForPushNotificationsWithUserResponse((response) => {
        console.log('Push notification permission:', response);
      });

      // Handle notification opened
      OneSignal.setNotificationOpenedHandler((notification) => {
        console.log('OneSignal: notification opened:', notification);
        // Deep link navigation handled in individual screens
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="match/[id]" options={{ title: 'Match Details' }} />
        <Stack.Screen name="teams/[id]" options={{ title: 'Teams' }} />
      </Stack>
    </QueryClientProvider>
  );
}
