import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Dimensions, Image, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { Match, Signup } from '@/lib/types';
import { formatMatchTime, getMatchStatus } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeInUp, Layout, SlideInDown } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Realtime updates for this match (signups change when players join/cancel/accept)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!id) return;

    const channel = supabase
      .channel(`match:${id}:signup-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signup',
          filter: `match_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['signups', id] });
          queryClient.invalidateQueries({ queryKey: ['signup', id, session?.user?.id] });
          queryClient.invalidateQueries({ queryKey: ['matches-with-signups'] });
          queryClient.invalidateQueries({ queryKey: ['match-capacity', id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, session?.user?.id, queryClient]);

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ['match', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match')
        .select('*, club:club_id(organizer_id)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Match & { club: { organizer_id: string } };
    },
  });

  // Check if current user is the match organizer
  const isOrganizer = match?.club?.organizer_id === session?.user?.id;

  const { data: matchCapacity } = useQuery({
    queryKey: ['match-capacity', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.rpc('get_match_capacity', { match_ids: [id] });
      if (error) throw error;
      return (data?.[0] as { match_id: string; confirmed_count: number; reserved_count: number }) || null;
    },
    enabled: !!id,
  });

  const { data: mySignup, refetch: refetchSignup } = useQuery({
    queryKey: ['signup', id, session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;

      const { data, error } = await supabase
        .from('signup')
        .select('*')
        .eq('match_id', id)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;
      return data as Signup;
    },
    enabled: !!session?.user?.id,
  });

  const { data: signups } = useQuery({
    queryKey: ['signups', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signup')
        .select('*')
        .eq('match_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles separately
      if (data && data.length > 0) {
        const userIds = data.map(s => s.user_id);
        const { data: profiles } = await supabase
          .from('profile')
          .select('user_id, display_name')
          .in('user_id', userIds);

        // Merge profiles with signups
        return data.map(signup => ({
          ...signup,
          profile: profiles?.find(p => p.user_id === signup.user_id) || null
        }));
      }

      return data || [];
    },
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error('Not authenticated');
      if (!id) throw new Error('Match not found');

      const supabaseUrl =
        (supabase as any).supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
      
      if (!supabaseUrl) {
        throw new Error("Supabase URL is not configured");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/join-match`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId: id }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Failed to join match');

      return { state: result.state as 'confirmed' | 'waitlist', position: result.position as number | undefined };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['signup', id] });
      queryClient.invalidateQueries({ queryKey: ['signups', id] });
      queryClient.invalidateQueries({ queryKey: ['matches-with-signups'] });
      queryClient.invalidateQueries({ queryKey: ['match-capacity', id] });
      refetchSignup();
      if (data?.state === 'waitlist' && typeof data.position === 'number') {
        Alert.alert('Waitlisted', `You are #${data.position} on the waitlist.`);
      }
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message);
    },
  });

  const lockAndGenerateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) throw new Error('Not authenticated');
      if (!id) throw new Error('Match not found');

      const supabaseUrl =
        (supabase as any).supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
      
      if (!supabaseUrl) {
        throw new Error("Supabase URL is not configured");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/lock-and-generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId: id }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate teams');
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['match', id] });
      queryClient.invalidateQueries({ queryKey: ['signups', id] });
      queryClient.invalidateQueries({ queryKey: ['matches-with-signups'] });
      Alert.alert(
        'Teams Generated',
        `Successfully created ${data.teams?.length || 0} teams!`,
        [{ text: 'View Teams', onPress: () => router.push(`/teams/${id}`) }]
      );
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) throw new Error('Not authenticated');

      // Get the Supabase URL from the client
      const supabaseUrl = (supabase as any).supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
      
      if (!supabaseUrl) {
        throw new Error("Supabase URL is not configured");
      }
      
      console.log('🚀 Calling cancel-signup Edge Function...');
      console.log('Match ID:', id);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/cancel-signup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ matchId: id }),
        }
      );

      console.log('📡 Response status:', response.status);
      const result = await response.json();
      console.log('📦 Response data:', result);

      if (!result.success) {
        console.error('❌ Edge Function error:', result.error);
        throw new Error(result.error || 'Failed to cancel signup');
      }
      
      return result;
    },
    onSuccess: (data) => {
      console.log('✅ Cancel successful:', data);
      if (data.promoted) {
        console.log('📨 Invitation sent to:', data.promoted.displayName);
        Alert.alert('Success', `Spot given to ${data.promoted.displayName}`);
      } else {
        Alert.alert('Success', 'Signup cancelled');
      }
      queryClient.invalidateQueries({ queryKey: ['signup', id] });
      queryClient.invalidateQueries({ queryKey: ['signups', id] });
      queryClient.invalidateQueries({ queryKey: ['matches-with-signups'] });
      queryClient.invalidateQueries({ queryKey: ['match-capacity', id] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      refetchSignup();
    },
    onError: (error: any) => {
      console.error('❌ Cancel mutation error:', error);
      Alert.alert('Error', error.message);
    },
  });

  if (matchLoading) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>Loading...</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>Match not found</Text>
      </View>
    );
  }

  const status = getMatchStatus(match, now);
  const signupOpenTime = new Date(match.signup_open_at).getTime();
  const isOpen = now.getTime() >= signupOpenTime;
  const confirmedCount = signups?.filter((s) => s.state === 'confirmed').length || 0;
  const waitlistCount = signups?.filter((s) => s.state === 'waitlist').length || 0;
  const reservedCount = matchCapacity?.reserved_count || 0;
  const occupiedCount = confirmedCount + reservedCount;
  const spotsLeft = Math.max(0, match.spots - occupiedCount);

  const canJoin = isOpen && status === 'open' && (!mySignup || mySignup.state === 'cancelled');
  const canCancel = mySignup && mySignup.state !== 'cancelled' && status !== 'locked';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return theme.colors.success;
      case 'locked': return theme.colors.primary;
      case 'cancelled': return theme.colors.error;
      default: return theme.colors.warning;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, '#1e1b4b']}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Match Details</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Match header with status */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View style={styles.headerSection}>
            <Text style={styles.dateLabel}>KICK OFF</Text>
            <View style={styles.header}>
              <Text style={styles.title}>{formatMatchTime(match.kick_off)}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20', borderColor: getStatusColor(status) }]}>
                <Text style={[styles.statusText, { color: getStatusColor(status) }]}>{status}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.statsContainer}>
          <BlurView intensity={20} tint="dark" style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{occupiedCount}/{match.spots}</Text>
              <Text style={styles.statLabel}>Spots</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{waitlistCount}</Text>
              <Text style={styles.statLabel}>Waitlist</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{match.teams_count}</Text>
              <Text style={styles.statLabel}>Teams</Text>
            </View>
          </BlurView>
        </Animated.View>

        {mySignup && mySignup.state !== 'cancelled' && (
          <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.myStatusContainer}>
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.myStatusGradient}
            >
              <View style={styles.myStatusContent}>
                <Ionicons name="checkmark-circle" size={24} color="white" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.myStatusTitle}>You are in!</Text>
                  <Text style={styles.myStatusSubtitle}>
                    {mySignup.state === 'confirmed' ? 'Confirmed Player' : `Waitlist Position #${mySignup.queue_pos}`}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        <View style={styles.actionContainer}>
          {canJoin && (
            <Animated.View entering={FadeInUp.delay(400)}>
              <TouchableOpacity
                onPress={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.success, '#059669']}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionButtonText}>
                    {joinMutation.isPending ? 'Joining...' : spotsLeft > 0 ? 'Join Match' : 'Join Waitlist'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {canCancel && (
            <Animated.View entering={FadeInUp.delay(400)}>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('Cancel Signup', 'Are you sure you want to cancel?', [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes', onPress: () => cancelMutation.mutate() },
                  ]);
                }}
                disabled={cancelMutation.isPending}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>
                  {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Signup'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {status === 'locked' && (
            <Animated.View entering={FadeInUp.delay(400)}>
              <TouchableOpacity
                onPress={() => router.push(`/teams/${id}`)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.primaryLight]}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionButtonText}>View Teams</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {isOrganizer && status !== 'locked' && status !== 'cancelled' && confirmedCount >= 2 && (
            <Animated.View entering={FadeInUp.delay(450)}>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Lock & Generate Teams',
                    `This will lock signups and generate ${match.teams_count} balanced teams for ${confirmedCount} players. This cannot be undone.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Generate Teams',
                        style: 'destructive',
                        onPress: () => lockAndGenerateMutation.mutate(),
                      },
                    ]
                  );
                }}
                disabled={lockAndGenerateMutation.isPending}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#f59e0b', '#d97706']}
                  style={styles.actionButton}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="lock-closed" size={20} color="white" />
                    <Text style={styles.actionButtonText}>
                      {lockAndGenerateMutation.isPending ? 'Generating...' : 'Lock & Generate Teams'}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Animated.View entering={FadeInUp.delay(500)}>
            <TouchableOpacity
              onPress={() => router.push(`/match/${id}/chat`)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#4F46E5', '#4338ca']}
                style={styles.actionButton}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="chatbubbles" size={20} color="white" />
                  <Text style={styles.actionButtonText}>Match Chat</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Confirmed Players</Text>
          <View style={styles.playersList}>
            {signups
              ?.filter((s) => s.state === 'confirmed')
              .map((signup, index) => (
                <Animated.View 
                  key={signup.id} 
                  entering={SlideInDown.delay(index * 50 + 500).springify()}
                  layout={Layout.springify()}
                  style={styles.playerCard}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {signup.profile?.display_name?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <Text style={styles.playerName}>
                    {signup.profile?.display_name || 'Unknown User'}
                  </Text>
                  <View style={styles.confirmedBadge}>
                    <Ionicons name="checkmark" size={12} color={theme.colors.success} />
                  </View>
                </Animated.View>
              ))}
            {confirmedCount === 0 && (
              <Text style={styles.emptyText}>No players joined yet</Text>
            )}
          </View>
        </View>

        {waitlistCount > 0 && (
          <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>Waitlist</Text>
            <View style={styles.playersList}>
              {signups
                ?.filter((s) => s.state === 'waitlist')
                .map((signup, index) => (
                  <Animated.View 
                    key={signup.id} 
                    entering={SlideInDown.delay(index * 50 + 500).springify()}
                    layout={Layout.springify()}
                    style={[styles.playerCard, styles.waitlistCard]}
                  >
                    <View style={styles.waitlistBadge}>
                      <Text style={styles.waitlistNum}>#{signup.queue_pos}</Text>
                    </View>
                    <Text style={[styles.playerName, styles.waitlistName]}>
                      {signup.profile?.display_name || 'Unknown User'}
                    </Text>
                  </Animated.View>
                ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.l,
    paddingTop: 60,
    paddingBottom: theme.spacing.m,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  backButton: {
    padding: 4,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  content: {
    padding: theme.spacing.l,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  headerSection: {
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.m,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.m,
  },
  dateLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small.fontSize,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: theme.typography.small.fontSize,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsContainer: {
    marginBottom: theme.spacing.xl,
  },
  statsCard: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.l,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: '100%',
  },
  statValue: {
    color: theme.colors.text,
    fontSize: theme.typography.h2.fontSize,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
  },
  myStatusContainer: {
    marginBottom: theme.spacing.xl,
    borderRadius: theme.borderRadius.l,
    overflow: 'hidden',
    ...theme.shadows.medium,
  },
  myStatusGradient: {
    padding: theme.spacing.m,
  },
  myStatusContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myStatusTitle: {
    color: 'white',
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  myStatusSubtitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: theme.typography.caption.fontSize,
  },
  actionContainer: {
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.m,
  },
  actionButton: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  actionButtonText: {
    color: 'white',
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
  cancelButton: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  cancelButtonText: {
    color: theme.colors.error,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
  listSection: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.h3.fontSize,
    fontWeight: '600',
    marginBottom: theme.spacing.m,
  },
  playersList: {
    gap: theme.spacing.s,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.s,
    paddingRight: theme.spacing.m,
    borderRadius: theme.borderRadius.full,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  avatarText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  playerName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '500',
  },
  confirmedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitlistCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  waitlistBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.m,
  },
  waitlistNum: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  waitlistName: {
    color: theme.colors.textSecondary,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: theme.spacing.m,
  },
});

