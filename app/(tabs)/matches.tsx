import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Match } from '@/lib/types';
import { formatMatchTime, getMatchStatus } from '@/lib/utils';
import { useEffect, useState } from 'react';

export default function MatchesScreen() {
  const router = useRouter();
  const [now, setNow] = useState(new Date());

  // Update time every second for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: matches, isLoading, refetch, isRefreshing } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match')
        .select('*')
        .gte('kick_off', new Date().toISOString())
        .order('kick_off', { ascending: true });

      if (error) throw error;
      return data as Match[];
    },
  });

  const renderMatch = ({ item }: { item: Match }) => {
    const status = getMatchStatus(item, now);
    const timeUntilOpen = new Date(item.signup_open_at).getTime() - now.getTime();
    const timeUntilKickoff = new Date(item.kick_off).getTime() - now.getTime();

    return (
      <TouchableOpacity
        style={styles.matchCard}
        onPress={() => router.push(`/match/${item.id}`)}
      >
        <View style={styles.matchHeader}>
          <Text style={styles.matchDate}>{formatMatchTime(item.kick_off)}</Text>
          <View style={[styles.statusBadge, styles[`status${status}`]]}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        {status === 'waiting' && timeUntilOpen > 0 && (
          <Text style={styles.countdown}>
            Opens in: {formatCountdown(timeUntilOpen)}
          </Text>
        )}

        {status === 'open' && (
          <Text style={styles.countdown}>
            Kick-off in: {formatCountdown(timeUntilKickoff)}
          </Text>
        )}

        <View style={styles.matchInfo}>
          <Text style={styles.spots}>
            {item.spots} spots • {item.teams_count} teams
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading matches...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={matches}
        renderItem={renderMatch}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No upcoming matches</Text>
          </View>
        }
      />
    </View>
  );
}

function formatCountdown(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchDate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
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
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
  },
  countdown: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: '600',
    marginBottom: 8,
  },
  matchInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spots: {
    fontSize: 14,
    color: '#6b7280',
  },
});
