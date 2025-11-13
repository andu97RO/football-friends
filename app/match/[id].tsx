import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { Match, Signup } from '@/lib/types';
import { formatMatchTime, getMatchStatus } from '@/lib/utils';
import { useState, useEffect } from 'react';

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

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ['match', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Match;
    },
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
        .single();

      if (error) return null;
      return data as Signup;
    },
    enabled: !!session?.user?.id,
  });

  const { data: signups } = useQuery({
    queryKey: ['signups', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signup')
        .select('*, profile:user_id(display_name)')
        .eq('match_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error('Match not found');

      const confirmed = signups?.filter((s) => s.state === 'confirmed').length || 0;
      const state = confirmed < match.spots ? 'confirmed' : 'waitlist';
      const queuePos = state === 'waitlist' ? signups?.filter((s) => s.state === 'waitlist').length || 0 : null;

      const { error } = await supabase.from('signup').insert({
        match_id: id as string,
        user_id: session!.user!.id,
        state,
        queue_pos: queuePos ? queuePos + 1 : null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signup', id] });
      queryClient.invalidateQueries({ queryKey: ['signups', id] });
      refetchSignup();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('signup')
        .update({ state: 'cancelled' })
        .eq('match_id', id)
        .eq('user_id', session!.user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signup', id] });
      queryClient.invalidateQueries({ queryKey: ['signups', id] });
      refetchSignup();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message);
    },
  });

  if (matchLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.centered}>
        <Text>Match not found</Text>
      </View>
    );
  }

  const status = getMatchStatus(match, now);
  const signupOpenTime = new Date(match.signup_open_at).getTime();
  const isOpen = now.getTime() >= signupOpenTime;
  const confirmedCount = signups?.filter((s) => s.state === 'confirmed').length || 0;
  const waitlistCount = signups?.filter((s) => s.state === 'waitlist').length || 0;

  const canJoin = isOpen && status === 'open' && !mySignup;
  const canCancel = mySignup && mySignup.state !== 'cancelled' && status !== 'locked';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{formatMatchTime(match.kick_off)}</Text>
          <View style={[styles.statusBadge, styles[`status${status}`]]}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Spots</Text>
            <Text style={styles.infoValue}>
              {confirmedCount}/{match.spots}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Waitlist</Text>
            <Text style={styles.infoValue}>{waitlistCount}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Teams</Text>
            <Text style={styles.infoValue}>{match.teams_count}</Text>
          </View>
        </View>

        {mySignup && mySignup.state !== 'cancelled' && (
          <View style={styles.myStatusCard}>
            <Text style={styles.myStatusTitle}>Your Status</Text>
            <Text style={styles.myStatusValue}>
              {mySignup.state === 'confirmed' ? 'Confirmed ✓' : `Waitlist #${mySignup.queue_pos}`}
            </Text>
          </View>
        )}

        {canJoin && (
          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {joinMutation.isPending ? 'Joining...' : 'Join Match'}
            </Text>
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              Alert.alert('Cancel Signup', 'Are you sure you want to cancel?', [
                { text: 'No', style: 'cancel' },
                { text: 'Yes', onPress: () => cancelMutation.mutate() },
              ]);
            }}
            disabled={cancelMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Signup'}
            </Text>
          </TouchableOpacity>
        )}

        {status === 'locked' && (
          <TouchableOpacity
            style={styles.teamsButton}
            onPress={() => router.push(`/teams/${id}`)}
          >
            <Text style={styles.buttonText}>View Teams</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statuswaiting: {
    backgroundColor: '#fef3c7',
  },
  statusopen: {
    backgroundColor: '#d1fae5',
  },
  statuslocked: {
    backgroundColor: '#dbeafe',
  },
  statuscompleted: {
    backgroundColor: '#e5e7eb',
  },
  statusscheduled: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  myStatusCard: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  myStatusTitle: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  myStatusValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  joinButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  teamsButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
