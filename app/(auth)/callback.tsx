import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setSession } = useAuthStore();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get the full URL to check for hash fragments
      const url = await Linking.getInitialURL();
      let isRecovery = false;

      // Check if this is a recovery flow from the URL hash
      if (url) {
        const hashParams = url.split('#')[1];
        if (hashParams) {
          const urlParams = new URLSearchParams(hashParams);
          isRecovery = urlParams.get('type') === 'recovery';
        }
      }

      // Also check query params (in case type is passed there)
      if (params.type === 'recovery') {
        isRecovery = true;
      }

      // Extract tokens from params or URL hash
      let access_token = params.access_token as string;
      let refresh_token = params.refresh_token as string;

      // If tokens not in params, try to get from URL hash
      if ((!access_token || !refresh_token) && url) {
        const hashParams = url.split('#')[1];
        if (hashParams) {
          const urlParams = new URLSearchParams(hashParams);
          access_token = access_token || urlParams.get('access_token') || '';
          refresh_token = refresh_token || urlParams.get('refresh_token') || '';
        }
      }

      if (access_token && refresh_token) {
        setStatus('Setting up your session...');
        
        // Set the session using the tokens
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error) throw error;

        setSession(data.session);

        // Check if this is a password recovery flow
        if (isRecovery) {
          setStatus('Redirecting to password reset...');
          router.replace('/(auth)/reset-password');
        } else {
          router.replace('/(tabs)/matches');
        }
      } else {
        // If no tokens, try to get the current session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session) {
          setSession(session);
          router.replace('/(tabs)/matches');
        } else {
          throw new Error('No session found');
        }
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#10b981" />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
});
