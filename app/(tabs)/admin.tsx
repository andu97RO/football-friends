import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/auth-store";
import { Profile } from "@/lib/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@/components/DateTimePicker";
import dayjs from "dayjs";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";

// Player Rating Row Component
function PlayerRatingRow({
  player,
  onUpdateRating,
  index,
}: {
  player: Profile;
  onUpdateRating: (rating: number) => void;
  index: number;
}) {
  const renderStars = () => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onUpdateRating(star)}
            style={styles.starButton}
          >
            <Ionicons
              name={star <= player.rating_base ? "star" : "star-outline"}
              size={24}
              color={star <= player.rating_base ? theme.colors.warning : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify()}
      style={styles.playerRow}
    >
      <View style={styles.playerInfo}>
        <View style={styles.playerAvatar}>
          <Text style={styles.playerAvatarText}>
            {player.display_name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.playerDetails}>
          <Text style={styles.playerName}>{player.display_name}</Text>
          <Text style={styles.playerRatingLabel}>
            Rating: {player.rating_base}/5
          </Text>
        </View>
      </View>
      {renderStars()}
    </Animated.View>
  );
}

export default function AdminScreen() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();

  // Active tab state
  const [activeTab, setActiveTab] = useState<'matches' | 'players'>('matches');

  // Search state for players
  const [searchQuery, setSearchQuery] = useState('');

  // Date/Time states
  // Default: 1 week from now, 7:00 PM
  const [kickOffDateTime, setKickOffDateTime] = useState(
    dayjs().add(1, "week").hour(19).minute(0).second(0)
  );
  // Default: Same day as kick-off, 12:00 PM
  const [signupOpenDateTime, setSignupOpenDateTime] = useState(
    dayjs().add(1, "week").hour(12).minute(0).second(0)
  );

  const handleKickOffDateChange = (date: Date) => {
    const newKickOff = dayjs(date);
    const oldKickOff = kickOffDateTime;

    // Calculate difference to sync signup date
    const diff = newKickOff.diff(oldKickOff);

    setKickOffDateTime(newKickOff);
    setSignupOpenDateTime(signupOpenDateTime.add(diff, "millisecond"));
  };

  const handleKickOffTimeChange = (date: Date) => {
    const newTime = dayjs(date);
    const newKickOff = kickOffDateTime
      .hour(newTime.hour())
      .minute(newTime.minute());

    setKickOffDateTime(newKickOff);
  };

  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Check if user is an admin
  const { data: profile, isLoading: checkingAdmin } = useQuery({
    queryKey: ["profile", session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;

      const { data, error } = await supabase
        .from("profile")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !data) return null;
      return data as Profile;
    },
    enabled: !!session?.user?.id,
  });

  const isAdmin = profile?.is_admin === true;

  // Get all players for rating management
  const { data: allPlayers, isLoading: loadingPlayers } = useQuery({
    queryKey: ["allPlayers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile")
        .select("*")
        .order("display_name", { ascending: true });

      if (error) throw error;
      return data as Profile[];
    },
    enabled: isAdmin === true && activeTab === 'players',
  });

  // Filter players based on search query
  const filteredPlayers = allPlayers?.filter((player) =>
    player.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get or create the default club
  const { data: defaultClub } = useQuery({
    queryKey: ["defaultClub"],
    queryFn: async () => {
      // Get the first club (the default one)
      let { data: club, error } = await supabase
        .from("club")
        .select("id")
        .limit(1)
        .single();

      // If no club exists, create one
      if (error && error.code === "PGRST116") {
        const { data: newClub, error: createError } = await supabase
          .from("club")
          .insert({
            name: "Football Friends Club",
            organizer_id: session?.user?.id,
          })
          .select()
          .single();

        if (createError) {
          console.error("Failed to create default club:", createError);
          return null;
        }
        return newClub;
      }

      return club;
    },
    enabled: isAdmin === true,
  });

  const updateRatingMutation = useMutation({
    mutationFn: async ({ userId, newRating }: { userId: string; newRating: number }) => {
      if (!session?.user?.id) throw new Error("Not authenticated");

      // Updates rating_base and writes the audit log entry atomically
      // server-side (audit_log has no client-facing INSERT policy).
      const { error } = await supabase.rpc("update_player_rating_atomic", {
        p_user_id: userId,
        p_new_rating: newRating,
      });

      if (error) throw error;

      return { userId, newRating };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allPlayers"] });
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message);
    },
  });

  const createMatchMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error("Not authenticated");
      if (!defaultClub?.id) throw new Error("No club available");

      // Create match using the default club
      const { data, error } = await supabase
        .from("match")
        .insert({
          club_id: defaultClub.id,
          kick_off: kickOffDateTime.toISOString(),
          signup_open_at: signupOpenDateTime.toISOString(),
          spots: 18,
          teams_count: 3,
          status: "scheduled",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      setShowSuccessModal(true);
      // Reset to default values
      setKickOffDateTime(dayjs().add(1, "week").hour(19).minute(0));
      setSignupOpenDateTime(dayjs().add(1, "week").hour(12).minute(0));
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message);
    },
  });

  const formatDateTime = (date: dayjs.Dayjs) => {
    return date.format("MMM D, YYYY h:mm A");
  };

  if (checkingAdmin) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>Loading...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>
          You don't have admin access
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, "#1e1b4b"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'matches' && styles.tabActive]}
          onPress={() => setActiveTab('matches')}
        >
          <Ionicons
            name="calendar"
            size={20}
            color={activeTab === 'matches' ? theme.colors.primary : theme.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}>
            Matches
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'players' && styles.tabActive]}
          onPress={() => setActiveTab('players')}
        >
          <Ionicons
            name="people"
            size={20}
            color={activeTab === 'players' ? theme.colors.primary : theme.colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'players' && styles.tabTextActive]}>
            Players
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'matches' && (
          <>
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <View style={styles.header}>
                <Text style={styles.title}>Create Match</Text>
                <Text style={styles.subtitle}>
                  Schedule a new match for your club
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).springify()}>
              <BlurView intensity={20} tint="dark" style={styles.formCard}>
                {/* Kick-off Date/Time */}
                <View style={styles.field}>
                  <DateTimePicker
                    label="Match Date"
                    value={kickOffDateTime.toDate()}
                    mode="date"
                    onChange={handleKickOffDateChange}
                    minimumDate={new Date()}
                  />

                  <DateTimePicker
                    label="Kick-off Time"
                    value={kickOffDateTime.toDate()}
                    mode="time"
                    onChange={handleKickOffTimeChange}
                  />
                </View>

                {/* Sign-up Opens Date/Time */}
                <View style={styles.field}>
                  <DateTimePicker
                    label="Sign-up Opens"
                    value={signupOpenDateTime.toDate()}
                    mode="datetime"
                    onChange={(date) => setSignupOpenDateTime(dayjs(date))}
                    minimumDate={new Date()}
                  />
                </View>

                {/* Additional Info */}
                <View style={styles.infoBox}>
                  <Ionicons
                    name="information-circle"
                    size={24}
                    color={theme.colors.primaryLight}
                  />
                  <View>
                    <Text style={styles.infoText}>• 18 spots available</Text>
                    <Text style={styles.infoText}>• 3 teams will be generated</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => createMatchMutation.mutate()}
                  disabled={createMatchMutation.isPending}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[theme.colors.success, "#059669"]}
                    style={styles.button}
                  >
                    <Text style={styles.buttonText}>
                      {createMatchMutation.isPending
                        ? "Creating..."
                        : "Create Match"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </BlurView>
            </Animated.View>
          </>
        )}

        {activeTab === 'players' && (
          <>
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <View style={styles.header}>
                <Text style={styles.title}>Manage Players</Text>
                <Text style={styles.subtitle}>
                  Edit player ratings for team balancing
                </Text>
              </View>
            </Animated.View>

            {/* Search Bar */}
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search players..."
                  placeholderTextColor={theme.colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>

            {/* Players List */}
            {loadingPlayers ? (
              <View style={styles.centered}>
                <Text style={{ color: theme.colors.text }}>Loading players...</Text>
              </View>
            ) : (
              <Animated.View entering={FadeInDown.delay(200).springify()}>
                <BlurView intensity={20} tint="dark" style={styles.formCard}>
                  {filteredPlayers && filteredPlayers.length > 0 ? (
                    filteredPlayers.map((player, index) => (
                      <PlayerRatingRow
                        key={player.user_id}
                        player={player}
                        onUpdateRating={(newRating) =>
                          updateRatingMutation.mutate({ userId: player.user_id, newRating })
                        }
                        index={index}
                      />
                    ))
                  ) : (
                    <View style={styles.centered}>
                      <Text style={{ color: theme.colors.textSecondary }}>
                        {searchQuery ? 'No players found' : 'No players yet'}
                      </Text>
                    </View>
                  )}
                </BlurView>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {/* Success Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={() => setShowSuccessModal(false)}
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
              colors={[theme.colors.surface, "#1e1b4b"]}
              style={styles.modalGradient}
            >
              <View style={styles.successIconContainer}>
                <Ionicons
                  name="checkmark-circle"
                  size={64}
                  color={theme.colors.success}
                />
              </View>
              <Text style={styles.modalTitle}>Match Created!</Text>
              <Text style={styles.modalText}>
                Your match has been successfully scheduled. Players can now sign
                up.
              </Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowSuccessModal(false)}
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.secondary]}
                  style={styles.modalButtonGradient}
                >
                  <Text style={styles.modalButtonText}>Awesome!</Text>
                </LinearGradient>
              </TouchableOpacity>
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
  content: {
    padding: theme.spacing.l,
    paddingBottom: 100, // Extra padding for scrolling
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.l,
    paddingTop: theme.spacing.m,
    gap: theme.spacing.s,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabActive: {
    backgroundColor: 'rgba(79, 70, 229, 0.2)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.borderRadius.m,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    gap: 8,
    marginBottom: theme.spacing.m,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    paddingVertical: 4,
  },
  playerRow: {
    flexDirection: 'column',
    paddingVertical: theme.spacing.m,
    paddingHorizontal: theme.spacing.m,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.s,
    gap: theme.spacing.m,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  playerRatingLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  starButton: {
    padding: 4,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  formCard: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.l,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: theme.spacing.l,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  dateButtonText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  pickerContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.s,
    marginTop: theme.spacing.s,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(79, 70, 229, 0.1)",
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.primaryLight,
  },
  button: {
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    alignItems: "center",
    marginTop: theme.spacing.s,
    ...theme.shadows.medium,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "85%",
    maxWidth: 400,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
    ...theme.shadows.large,
  },
  modalGradient: {
    padding: theme.spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  successIconContainer: {
    marginBottom: theme.spacing.l,
    ...theme.shadows.medium,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: theme.spacing.s,
    textAlign: "center",
  },
  modalText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
  },
  modalButton: {
    width: "100%",
    borderRadius: theme.borderRadius.l,
    overflow: "hidden",
    ...theme.shadows.medium,
  },
  modalButtonGradient: {
    padding: theme.spacing.m,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
