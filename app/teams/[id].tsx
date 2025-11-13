import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function TeamsScreen() {
  const { id } = useLocalSearchParams();

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team')
        .select(`
          id,
          name,
          team_assignment(
            user_id,
            profile:user_id(display_name, rating_base)
          )
        `)
        .eq('match_id', id)
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading teams...</Text>
      </View>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>Teams not generated yet</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {teams.map((team: any) => {
          const players = team.team_assignment || [];
          const totalRating = players.reduce((sum: number, p: any) => sum + (p.profile?.rating_base || 3), 0);
          const avgRating = players.length > 0 ? (totalRating / players.length).toFixed(1) : '0';

          return (
            <View key={team.id} style={styles.teamCard}>
              <View style={styles.teamHeader}>
                <Text style={styles.teamName}>{team.name}</Text>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>⭐ {avgRating}</Text>
                </View>
              </View>

              <View style={styles.playersList}>
                {players.map((assignment: any, idx: number) => (
                  <View key={assignment.user_id} style={styles.playerRow}>
                    <Text style={styles.playerNumber}>{idx + 1}</Text>
                    <Text style={styles.playerName}>
                      {assignment.profile?.display_name || 'Unknown'}
                    </Text>
                    <Text style={styles.playerRating}>
                      {assignment.profile?.rating_base || 3}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.teamFooter}>
                <Text style={styles.footerText}>
                  {players.length} players • Total rating: {totalRating}
                </Text>
              </View>
            </View>
          );
        })}
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
    padding: 16,
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamCard: {
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
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#10b981',
  },
  teamName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  ratingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  playersList: {
    gap: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  playerNumber: {
    width: 24,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  playerRating: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  teamFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
