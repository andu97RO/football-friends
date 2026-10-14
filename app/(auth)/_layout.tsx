import { Stack } from 'expo-router';
import { theme } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="check-inbox" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}
