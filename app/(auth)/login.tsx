import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { isVerifiedSession } from '@/lib/auth-utils';

export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address first');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'footy://auth/callback?type=recovery',
      });

      if (error) throw error;

      Alert.alert(
        'Check your email',
        'We sent you a password reset link. Click the link in your email to reset your password.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (!isVerifiedSession(data.session)) {
        await supabase.auth.signOut({ scope: 'local' });
        setError('Please confirm your email address before signing in.');
        return;
      }

      // Explicitly set the session in the auth store
      setSession(data.session);

      router.replace('/(tabs)/matches');
    } catch (error: any) {
      setError(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[theme.colors.background, '#1e1b4b']}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="football" size={48} color={theme.colors.success} />
            </View>
            <Text style={styles.title}>Football Friends</Text>
            <Text style={styles.subtitle}>
              Organize your weekly 6-a-side matches
            </Text>
          </View>

          <BlurView intensity={20} tint="dark" style={styles.formCard}>
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons
                  name="alert-circle"
                  size={20}
                  color={theme.colors.error}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            <Animated.View entering={FadeInUp} style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor={theme.colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={handleForgotPassword}
                disabled={loading}
              >
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              onPress={handlePasswordLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[theme.colors.success, '#059669']}
                style={styles.button}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Loading...' : 'Sign In'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <Link href="/(auth)/sign-up" asChild>
                <TouchableOpacity>
                  <Text style={styles.linkText}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </BlurView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: theme.spacing.l,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  formCard: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.l,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputContainer: {
    marginBottom: theme.spacing.m,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  button: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    alignItems: 'center',
    marginTop: theme.spacing.s,
    ...theme.shadows.medium,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotPasswordText: {
    color: theme.colors.primaryLight,
    fontSize: 13,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginLeft: theme.spacing.s,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.l,
    paddingTop: theme.spacing.m,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  linkText: {
    color: theme.colors.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
});
