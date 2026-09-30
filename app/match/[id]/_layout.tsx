import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/auth-store';
import { isVerifiedSession } from '@/lib/auth-utils';
import { theme } from '@/constants/theme';
import { LoadingState } from '@/components/ui';

export default function MatchLayout() {
  const session = useAuthStore((state) => state.session);
  if (session === undefined) return <LoadingState />;
  if (!isVerifiedSession(session)) return <Redirect href="/login" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
