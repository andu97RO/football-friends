import { isVerifiedSession } from '@/lib/auth-utils';
import { useGroupRole, groupPlayers } from '@/lib/groups';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showAlert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, Layout, ZoomIn } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

export default function TeamsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    userId: string;
    name: string;
    fromTeamId: string;
    fromTeamName: string;
  } | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const { data: match } = useQuery({
    queryKey: ['match', id, session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('match').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: role } = useGroupRole(match?.club_id);
  const isAdmin = role === 'owner' || role === 'admin';

  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams', id, session?.user.id],
    enabled: !!match,
    queryFn: async () => {
      // Get teams with assignments
      const { data: teamsData, error: teamsError } = await supabase
        .from('team')
        .select('id, name')
        .eq('match_id', id)
        .order('name', { ascending: true });

      if (teamsError) throw teamsError;
      if (!teamsData || teamsData.length === 0) return [];

      // Get all team assignments
      const teamIds = teamsData.map(t => t.id);
      const { data: assignments, error: assignmentsError } = await supabase
        .from('team_assignment')
        .select('team_id, user_id')
        .in('team_id', teamIds);

      if (assignmentsError) throw assignmentsError;

      // Get profiles for all assigned users
      const userIds = assignments?.map(a => a.user_id) || [];
      let profiles: { user_id: string; display_name: string; rating_base: number }[] = [];

      if (userIds.length > 0) {
        profiles = await groupPlayers(match!.club_id);
      }

      // Combine data
      return teamsData.map(team => ({
        ...team,
        team_assignment: (assignments || [])
          .filter(a => a.team_id === team.id)
          .map(a => ({
            user_id: a.user_id,
            profile: profiles.find(p => p.user_id === a.user_id) || null,
          })),
      }));
    },
  });

  const swapPlayerMutation = useMutation({
    mutationFn: async ({ toTeamId }: { toTeamId: string }) => {
      if (!selectedPlayer) throw new Error('No player selected');

      const { data, error } = await supabase.functions.invoke('swap-players', {
        body: {
          matchId: id,
          playerId: selectedPlayer.userId,
          fromTeamId: selectedPlayer.fromTeamId,
          toTeamId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
      setShowMoveModal(false);
      setSelectedPlayer(null);
      showAlert('Success', 'Player moved successfully');
    },
    onError: (error: any) => {
      showAlert('Error', error.message || 'Failed to move player');
    },
  });

  const handlePlayerPress = (
    userId: string,
    name: string,
    teamId: string,
    teamName: string
  ) => {
    if (!editMode) return;

    setSelectedPlayer({
      userId,
      name,
      fromTeamId: teamId,
      fromTeamName: teamName,
    });
    setShowMoveModal(true);
  };

  const handleMoveToTeam = (toTeamId: string) => {
    if (!selectedPlayer || toTeamId === selectedPlayer.fromTeamId) {
      setShowMoveModal(false);
      return;
    }

    swapPlayerMutation.mutate({ toTeamId });
  };

  if (session === null) return <Redirect href="/login" />;
  if (session && !isVerifiedSession(session)) return <Redirect href="/login" />;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>Loading teams...</Text>
      </View>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <View style={styles.centered}>
        <LinearGradient
          colors={[theme.colors.background, '#1e1b4b']}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="people-outline" size={48} color={theme.colors.textSecondary} style={{ marginBottom: 16 }} />
        <Text style={styles.emptyText}>Teams not generated yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, '#1e1b4b']}
        style={StyleSheet.absoluteFill}
      />

      {/* Navigation Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Teams</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Edit Mode Toggle (Admin Only) */}
      {isAdmin && teams && teams.length > 0 && (
        <View style={styles.editModeContainer}>
          <TouchableOpacity
            style={[styles.editButton, editMode && styles.editButtonActive]}
            onPress={() => setEditMode(!editMode)}
          >
            <Ionicons
              name={editMode ? 'close' : 'pencil'}
              size={20}
              color={editMode ? theme.colors.error : theme.colors.text}
            />
            <Text style={[styles.editButtonText, editMode && styles.editButtonTextActive]}>
              {editMode ? 'Cancel' : 'Edit Teams'}
            </Text>
          </TouchableOpacity>
          {editMode && (
            <Text style={styles.editModeHint}>Tap a player to move them</Text>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {teams.map((team: any, index: number) => {
          const players = team.team_assignment || [];
          const totalRating = players.reduce((sum: number, p: any) => sum + (p.profile?.rating_base ?? 3), 0);
          const avgRating = players.length > 0 ? (totalRating / players.length).toFixed(1) : '0';

          return (
            <Animated.View 
              key={team.id} 
              entering={FadeInDown.delay(index * 200).springify()}
              layout={Layout.springify()}
            >
              <BlurView intensity={20} tint="dark" style={styles.teamCard}>
                <View style={styles.teamHeader}>
                  <View style={styles.teamTitleContainer}>
                    <Ionicons name="shield-half" size={24} color={theme.colors.primary} />
                    <Text style={styles.teamName}>{team.name}</Text>
                  </View>
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={12} color={theme.colors.warning} style={{ marginRight: 4 }} />
                    <Text style={styles.ratingText}>{avgRating}</Text>
                  </View>
                </View>

                <View style={styles.playersList}>
                  {players.map((assignment: any, idx: number) => {
                    const PlayerWrapper = editMode ? TouchableOpacity : View;
                    return (
                      <Animated.View
                        key={assignment.user_id}
                        entering={FadeInDown.delay(index * 200 + idx * 50).springify()}
                      >
                        <PlayerWrapper
                          style={[styles.playerRow, editMode && styles.playerRowEditable]}
                          onPress={editMode ? () => handlePlayerPress(
                            assignment.user_id,
                            assignment.profile?.display_name || 'Unknown',
                            team.id,
                            team.name
                          ) : undefined}
                        >
                          <View style={styles.playerInfo}>
                            <Text style={styles.playerNumber}>{idx + 1}</Text>
                            <Text style={styles.playerName}>
                              {assignment.profile?.display_name || 'Unknown'}
                            </Text>
                          </View>
                          <View style={styles.playerRatingContainer}>
                            <Text style={styles.playerRating}>
                              {assignment.profile?.rating_base ?? 3}
                            </Text>
                            {editMode && (
                              <Ionicons
                                name="chevron-forward"
                                size={16}
                                color={theme.colors.textSecondary}
                                style={{ marginLeft: 8 }}
                              />
                            )}
                          </View>
                        </PlayerWrapper>
                      </Animated.View>
                    );
                  })}
                </View>

                <View style={styles.teamFooter}>
                  <Text style={styles.footerText}>
                    {players.length} players • Total rating: {totalRating}
                  </Text>
                </View>
              </BlurView>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Move Player Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showMoveModal}
        onRequestClose={() => setShowMoveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            entering={ZoomIn.springify()}
            style={styles.modalContent}
          >
            <LinearGradient
              colors={[theme.colors.surface, '#1e1b4b']}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Move Player</Text>
                <TouchableOpacity onPress={() => setShowMoveModal(false)}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalPlayerName}>{selectedPlayer?.name}</Text>
              <Text style={styles.modalSubtitle}>
                From: {selectedPlayer?.fromTeamName}
              </Text>

              <Text style={styles.modalLabel}>Select destination team:</Text>

              <View style={styles.teamOptions}>
                {teams?.map((team: any) => {
                  const isCurrentTeam = team.id === selectedPlayer?.fromTeamId;
                  return (
                    <TouchableOpacity
                      key={team.id}
                      style={[
                        styles.teamOption,
                        isCurrentTeam && styles.teamOptionDisabled,
                      ]}
                      onPress={() => handleMoveToTeam(team.id)}
                      disabled={isCurrentTeam || swapPlayerMutation.isPending}
                    >
                      <View style={styles.teamOptionContent}>
                        <Ionicons
                          name="shield-half"
                          size={20}
                          color={isCurrentTeam ? theme.colors.textSecondary : theme.colors.primary}
                        />
                        <Text
                          style={[
                            styles.teamOptionText,
                            isCurrentTeam && styles.teamOptionTextDisabled,
                          ]}
                        >
                          {team.name}
                        </Text>
                        {isCurrentTeam && (
                          <Text style={styles.currentBadge}>Current</Text>
                        )}
                      </View>
                      {!isCurrentTeam && (
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={theme.colors.textSecondary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {swapPlayerMutation.isPending && (
                <Text style={styles.loadingText}>Moving player...</Text>
              )}
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
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
    padding: theme.spacing.m,
    paddingTop: theme.spacing.m,
    gap: theme.spacing.l,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  editModeContainer: {
    padding: theme.spacing.m,
    paddingBottom: 0,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.s,
    paddingHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  editButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: theme.colors.error,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  editButtonTextActive: {
    color: theme.colors.error,
  },
  editModeHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s,
  },
  playerRowEditable: {
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.3)',
  },
  teamCard: {
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
    paddingBottom: theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  teamTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  playersList: {
    gap: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: theme.borderRadius.m,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerNumber: {
    width: 24,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  playerName: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  playerRatingContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerRating: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primaryLight,
  },
  teamFooter: {
    marginTop: theme.spacing.m,
    paddingTop: theme.spacing.s,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '85%',
    maxWidth: 400,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: theme.spacing.l,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalPlayerName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.l,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  teamOptions: {
    gap: theme.spacing.s,
  },
  teamOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.m,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  teamOptionDisabled: {
    opacity: 0.5,
  },
  teamOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  teamOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  teamOptionTextDisabled: {
    color: theme.colors.textSecondary,
  },
  currentBadge: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.s,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: theme.spacing.m,
  },
});
