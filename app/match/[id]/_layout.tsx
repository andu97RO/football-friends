import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { ActivityIndicator } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { theme } from '@/constants/theme';

export default function MatchLayout() {
  const session = useAuthStore((state) => state.session);
  if (session === undefined) return <ActivityIndicator />;
  if (!isVerifiedSession(session)) return <Redirect href="/login" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
    </Stack>
  );
}
