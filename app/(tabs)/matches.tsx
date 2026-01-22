import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Match, Profile } from "@/lib/types";
import { formatMatchTime, formatMatchTimeShort, getMatchStatus } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import DateTimePicker from "@/components/DateTimePicker";
import dayjs from "dayjs";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  FadeInDown,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/lib/auth-store";
import * as Haptics from "expo-haptics";

interface MatchWithSignups extends Match {
  confirmed_count: number;
  user_signup_state: "confirmed" | "waitlist" | "cancelled" | null;
}

type MatchSection = {
  title: string;
  subtitle: string;
  data: MatchWithSignups[];
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function MatchesScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [filter, setFilter] = useState<"all" | "open">("all");

  // Admin state
  const [editingMatch, setEditingMatch] = useState<MatchWithSignups | null>(null);
  const [editKickOff, setEditKickOff] = useState(dayjs());
  const [editSignupOpen, setEditSignupOpen] = useState(dayjs());

  // Check if user is admin
  const { data: profile } = useQuery({
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

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const {
    data: matchesWithSignups,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["matches-with-signups", session?.user?.id],
    queryFn: async () => {
      const { data: matches, error } = await supabase
        .from("match")
        .select("*")
        .gte("kick_off", new Date().toISOString())
        .order("kick_off", { ascending: true });

      if (error) throw error;
      if (!matches || matches.length === 0) return [];

      const matchIds = matches.map((m) => m.id);

      const { data: capacity, error: capacityError } = await supabase.rpc(
        "get_match_capacity",
        {
          match_ids: matchIds,
        }
      );

      if (capacityError) throw capacityError;

      let userSignups: { match_id: string; state: string }[] = [];
      if (session?.user?.id) {
        const { data } = await supabase
          .from("signup")
          .select("match_id, state")
          .in("match_id", matchIds)
          .eq("user_id", session.user.id)
          .neq("state", "cancelled");
        userSignups = data || [];
      }

      const capacityByMatch: Record<string, { confirmed_count: number }> = {};
      (capacity || []).forEach((c: any) => {
        capacityByMatch[c.match_id] = {
          confirmed_count: c.confirmed_count || 0,
        };
      });

      const userSignupByMatch: Record<string, string> = {};
      userSignups.forEach((s) => {
        userSignupByMatch[s.match_id] = s.state;
      });

      return matches.map((match) => ({
        ...match,
        confirmed_count: capacityByMatch[match.id]?.confirmed_count || 0,
        user_signup_state:
          (userSignupByMatch[match.id] as "confirmed" | "waitlist" | null) ||
          null,
      })) as MatchWithSignups[];
    },
  });

  // Realtime updates: keep match list fresh without polling
  useEffect(() => {
    if (Platform.OS === "web") return;

    const matchIds = matchesWithSignups?.map((m) => m.id) || [];

    if (matchIds.length === 0) return;

    const channel = supabase
      .channel(`matches:changes:${session?.user?.id || "anon"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signup",
          filter: `match_id=in.(${matchIds.join(",")})`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["matches-with-signups"] });
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchesWithSignups, session?.user?.id, queryClient]);

  const joinMutation = useMutation({
    mutationFn: async (matchId: string) => {
      if (!session?.access_token) throw new Error("Not authenticated");

      const supabaseUrl =
        (supabase as any).supabaseUrl ||
        process.env.EXPO_PUBLIC_SUPABASE_URL;
      
      if (!supabaseUrl) {
        throw new Error("Supabase URL is not configured");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/join-match`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ matchId }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to join match");
      }

      return {
        matchId,
        state: result.state as "confirmed" | "waitlist",
        position: result.position as number | undefined,
      };
    },
    onMutate: async (matchId) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      return {};
    },
    onError: (error: any) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert("Error", error.message || "Failed to join match");
    },
    onSuccess: (data) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (data.state === "waitlist" && typeof data.position === "number") {
        Alert.alert("Waitlisted", `You are #${data.position} on the waitlist.`);
      }
      queryClient.invalidateQueries({ queryKey: ["matches-with-signups"] });
      // Invalidate match detail queries for this specific match
      queryClient.invalidateQueries({ queryKey: ["signup", data.matchId] });
      queryClient.invalidateQueries({ queryKey: ["signups", data.matchId] });
    },
  });

  // Edit match mutation (admin only)
  const editMatchMutation = useMutation({
    mutationFn: async ({
      matchId,
      kickOff,
      signupOpenAt,
    }: {
      matchId: string;
      kickOff: string;
      signupOpenAt: string;
    }) => {
      const { data, error } = await supabase
        .from("match")
        .update({
          kick_off: kickOff,
          signup_open_at: signupOpenAt,
        })
        .eq("id", matchId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: ["matches-with-signups"] });
      setEditingMatch(null);
      Alert.alert("Success", "Match updated successfully");
    },
    onError: (error: any) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert("Error", error.message || "Failed to update match");
    },
  });

  // Delete match mutation (admin only)
  const deleteMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      // Delete in order to respect foreign key constraints:
      // 1. Delete rating_snapshots (references match_id)
      const { error: ratingError } = await supabase
        .from("rating_snapshot")
        .delete()
        .eq("match_id", matchId);
      if (ratingError) throw ratingError;

      // 2. Get team IDs for this match
      const { data: teams } = await supabase
        .from("team")
        .select("id")
        .eq("match_id", matchId);

      // 3. Delete team_assignments (references team_id)
      if (teams && teams.length > 0) {
        const teamIds = teams.map((t) => t.id);
        const { error: assignmentError } = await supabase
          .from("team_assignment")
          .delete()
          .in("team_id", teamIds);
        if (assignmentError) throw assignmentError;
      }

      // 4. Delete teams (references match_id)
      const { error: teamError } = await supabase
        .from("team")
        .delete()
        .eq("match_id", matchId);
      if (teamError) throw teamError;

      // 5. Delete signups (references match_id)
      const { error: signupError } = await supabase
        .from("signup")
        .delete()
        .eq("match_id", matchId);
      if (signupError) throw signupError;

      // 6. Delete audit_log entries (references match_id)
      const { error: auditError } = await supabase
        .from("audit_log")
        .delete()
        .eq("match_id", matchId);
      if (auditError) throw auditError;

      // 7. Finally delete the match
      const { error } = await supabase.from("match").delete().eq("id", matchId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: ["matches-with-signups"] });
      Alert.alert("Success", "Match deleted successfully");
    },
    onError: (error: any) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert("Error", error.message || "Failed to delete match");
    },
  });

  const handleEditMatch = (match: MatchWithSignups) => {
    setEditKickOff(dayjs(match.kick_off));
    setEditSignupOpen(dayjs(match.signup_open_at));
    setEditingMatch(match);
  };

  const handleSaveEdit = () => {
    if (!editingMatch) return;
    editMatchMutation.mutate({
      matchId: editingMatch.id,
      kickOff: editKickOff.toISOString(),
      signupOpenAt: editSignupOpen.toISOString(),
    });
  };

  const handleDeleteMatch = (match: MatchWithSignups) => {
    Alert.alert(
      "Delete Match",
      `Are you sure you want to delete the match on ${formatMatchTime(match.kick_off)}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMatchMutation.mutate(match.id),
        },
      ]
    );
  };

  const getSections = useCallback((): MatchSection[] => {
    if (!matchesWithSignups) return [];

    const openMatches: MatchWithSignups[] = [];
    const waitingMatches: MatchWithSignups[] = [];
    const lockedMatches: MatchWithSignups[] = [];

    matchesWithSignups.forEach((match) => {
      const status = getMatchStatus(match, now);
      if (status === "open") {
        openMatches.push(match);
      } else if (status === "waiting") {
        waitingMatches.push(match);
      } else {
        lockedMatches.push(match);
      }
    });

    if (filter === "open") {
      return openMatches.length > 0
        ? [
            {
              title: "Open Now",
              subtitle: "Join before spots fill up!",
              data: openMatches,
            },
          ]
        : [];
    }

    const sections: MatchSection[] = [];

    if (openMatches.length > 0) {
      sections.push({
        title: "Open Now",
        subtitle: "Join before spots fill up!",
        data: openMatches,
      });
    }

    if (waitingMatches.length > 0) {
      sections.push({
        title: "Opening Soon",
        subtitle: "Get ready to join",
        data: waitingMatches,
      });
    }

    if (lockedMatches.length > 0) {
      sections.push({
        title: "Locked",
        subtitle: "Teams are set",
        data: lockedMatches,
      });
    }

    return sections;
  }, [matchesWithSignups, now, filter]);

  const getUrgencyLevel = (
    match: MatchWithSignups
  ): "normal" | "filling" | "critical" => {
    const spotsLeft = Math.max(0, match.spots - match.confirmed_count);
    const percentLeft = spotsLeft / match.spots;

    if (percentLeft <= 0.25 || spotsLeft <= 2) return "critical";
    if (percentLeft <= 0.5) return "filling";
    return "normal";
  };

  const getUrgencyColor = (urgency: "normal" | "filling" | "critical") => {
    switch (urgency) {
      case "critical":
        return theme.colors.error;
      case "filling":
        return theme.colors.warning;
      default:
        return theme.colors.success;
    }
  };

  const openMatchCount =
    matchesWithSignups?.filter((m) => getMatchStatus(m, now) === "open")
      .length || 0;

  const renderMatch = ({
    item,
    index,
    section,
  }: {
    item: MatchWithSignups;
    index: number;
    section: MatchSection;
  }) => {
    const status = getMatchStatus(item, now);
    const timeUntilOpen =
      new Date(item.signup_open_at).getTime() - now.getTime();
    const timeUntilKickoff = new Date(item.kick_off).getTime() - now.getTime();
    const isOpen = status === "open";
    const spotsLeft = Math.max(0, item.spots - item.confirmed_count);
    const urgency = getUrgencyLevel(item);
    const urgencyColor = getUrgencyColor(urgency);
    const fillPercent = (item.confirmed_count / item.spots) * 100;

    const canJoin = isOpen && !item.user_signup_state && session?.user?.id;
    const isJoined =
      item.user_signup_state === "confirmed" ||
      item.user_signup_state === "waitlist";
    const isJoining =
      joinMutation.isPending && joinMutation.variables === item.id;

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 80).springify()}
        layout={Layout.springify()}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push(`/match/${item.id}`)}
        >
          <BlurView
            intensity={20}
            tint="dark"
            style={[
              styles.matchCard,
              isOpen && styles.matchCardOpen,
              urgency === "critical" && isOpen && styles.matchCardCritical,
            ]}
          >
            <View style={styles.matchHeader}>
              <View style={styles.dateContainer}>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={theme.colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.matchDate}>
                  {formatMatchTimeShort(item.kick_off)}
                </Text>
              </View>
              <View style={styles.headerRight}>
                {isAdmin && (
                  <View style={styles.adminActions}>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleEditMatch(item);
                      }}
                      style={styles.adminActionButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="pencil"
                        size={14}
                        color={theme.colors.primaryLight}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteMatch(item);
                      }}
                      style={styles.adminActionButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={14}
                        color={theme.colors.error}
                      />
                    </TouchableOpacity>
                  </View>
                )}
                <StatusBadge
                  status={status}
                  urgency={isOpen ? urgency : undefined}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.spotsSection}>
              <View style={styles.spotsInfo}>
                <Text
                  style={[styles.spotsText, isOpen && { color: urgencyColor }]}
                >
                  {spotsLeft}/{item.spots} spots left
                </Text>
                {urgency === "critical" && isOpen && (
                  <PulsingBadge text="LAST SPOTS!" color={theme.colors.error} />
                )}
                {urgency === "filling" && isOpen && (
                  <View
                    style={[
                      styles.fillingBadge,
                      { backgroundColor: theme.colors.warning + "20" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.fillingText,
                        { color: theme.colors.warning },
                      ]}
                    >
                      Filling up
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBg}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${fillPercent}%`,
                        backgroundColor: urgencyColor,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            <View style={styles.detailsRow}>
              <View style={styles.detailChip}>
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.detailChipText}>
                  {item.teams_count} teams
                </Text>
              </View>
              <View style={styles.detailChip}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.detailChipText}>
                  {status === "waiting" && timeUntilOpen > 0
                    ? `Opens ${formatCountdown(timeUntilOpen)}`
                    : status === "open"
                    ? `Kicks off ${formatCountdown(timeUntilKickoff)}`
                    : "Locked"}
                </Text>
              </View>
            </View>

            {isOpen && (
              <View style={styles.actionRow}>
                {isJoined ? (
                  <Animated.View entering={FadeIn} style={styles.joinedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={theme.colors.success}
                    />
                    <Text style={styles.joinedText}>
                      {item.user_signup_state === "confirmed"
                        ? "You're in!"
                        : "Waitlisted"}
                    </Text>
                  </Animated.View>
                ) : canJoin ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      joinMutation.mutate(item.id);
                    }}
                    disabled={isJoining}
                    activeOpacity={0.8}
                    style={styles.joinButtonWrapper}
                  >
                    <LinearGradient
                      colors={
                        urgency === "critical"
                          ? [theme.colors.error, "#dc2626"]
                          : [theme.colors.success, "#059669"]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.joinButton}
                    >
                      <Ionicons
                        name={isJoining ? "hourglass-outline" : "flash"}
                        size={18}
                        color="white"
                      />
                      <Text style={styles.joinButtonText}>
                        {isJoining
                          ? "Joining..."
                          : spotsLeft > 0
                          ? "JOIN"
                          : "JOIN WAITLIST"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : !session?.user?.id ? (
                  <TouchableOpacity
                    onPress={() => router.push("/login")}
                    style={styles.loginPrompt}
                  >
                    <Text style={styles.loginPromptText}>Log in to join</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </BlurView>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderSectionHeader = ({ section }: { section: MatchSection }) => (
    <Animated.View entering={FadeIn.delay(50)} style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
      </View>
      {section.title === "Open Now" && (
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
        </View>
      )}
    </Animated.View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>Loading matches...</Text>
      </View>
    );
  }

  const sections = getSections();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, "#1e1b4b"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.filterContainer}>
        <TouchableOpacity
          onPress={() => setFilter("all")}
          style={[styles.filterTab, filter === "all" && styles.filterTabActive]}
        >
          <Text
            style={[
              styles.filterTabText,
              filter === "all" && styles.filterTabTextActive,
            ]}
          >
            All Matches
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFilter("open")}
          style={[
            styles.filterTab,
            filter === "open" && styles.filterTabActive,
          ]}
        >
          <Text
            style={[
              styles.filterTabText,
              filter === "open" && styles.filterTabTextActive,
            ]}
          >
            Open Now
          </Text>
          {openMatchCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{openMatchCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderMatch}
        extraData={isAdmin}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons
              name="football-outline"
              size={48}
              color={theme.colors.textSecondary}
              style={{ marginBottom: 16 }}
            />
            <Text style={styles.emptyText}>
              {filter === "open"
                ? "No open matches right now"
                : "No upcoming matches"}
            </Text>
            {filter === "open" && (
              <TouchableOpacity
                onPress={() => setFilter("all")}
                style={styles.viewAllButton}
              >
                <Text style={styles.viewAllText}>View all matches</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Edit Match Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!editingMatch}
        onRequestClose={() => setEditingMatch(null)}
      >
        <View style={styles.modalOverlay}>
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.modalContent}
          >
            <LinearGradient
              colors={[theme.colors.surface, "#1e1b4b"]}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Match</Text>
                <TouchableOpacity
                  onPress={() => setEditingMatch(null)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalForm}>
                <DateTimePicker
                  label="Match Date"
                  value={editKickOff.toDate()}
                  mode="date"
                  onChange={(date) => {
                    const newKickOff = dayjs(date)
                      .hour(editKickOff.hour())
                      .minute(editKickOff.minute());
                    setEditKickOff(newKickOff);
                  }}
                  minimumDate={new Date()}
                />

                <DateTimePicker
                  label="Kick-off Time"
                  value={editKickOff.toDate()}
                  mode="time"
                  onChange={(date) => {
                    const newTime = dayjs(date);
                    setEditKickOff(
                      editKickOff.hour(newTime.hour()).minute(newTime.minute())
                    );
                  }}
                />

                <DateTimePicker
                  label="Sign-up Opens"
                  value={editSignupOpen.toDate()}
                  mode="datetime"
                  onChange={(date) => setEditSignupOpen(dayjs(date))}
                  minimumDate={new Date()}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setEditingMatch(null)}
                  style={styles.modalCancelButton}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={editMatchMutation.isPending}
                  activeOpacity={0.8}
                  style={styles.modalSaveButtonWrapper}
                >
                  <LinearGradient
                    colors={[theme.colors.success, "#059669"]}
                    style={styles.modalSaveButton}
                  >
                    <Text style={styles.modalSaveText}>
                      {editMatchMutation.isPending ? "Saving..." : "Save Changes"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function StatusBadge({
  status,
  urgency,
}: {
  status: string;
  urgency?: "normal" | "filling" | "critical";
}) {
  const getStatusColor = () => {
    if (status === "open" && urgency === "critical") return theme.colors.error;
    if (status === "open") return theme.colors.success;
    if (status === "locked") return theme.colors.primary;
    if (status === "cancelled") return theme.colors.error;
    return theme.colors.warning;
  };

  const statusColor = getStatusColor();

  return (
    <View
      style={[
        styles.statusBadge,
        { borderColor: statusColor, backgroundColor: statusColor + "20" },
      ]}
    >
      <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
    </View>
  );
}

function PulsingBadge({ text, color }: { text: string; color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.pulsingBadge,
        { backgroundColor: color + "20" },
        animatedStyle,
      ]}
    >
      <Ionicons name="warning" size={12} color={color} />
      <Text style={[styles.pulsingText, { color }]}>{text}</Text>
    </Animated.View>
  );
}

function formatCountdown(ms: number): string {
  if (ms < 0) return "now";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days}d ${hours % 24}h`;
  if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `in ${minutes}m ${seconds % 60}s`;
  return `in ${seconds}s`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.m,
    paddingTop: theme.spacing.m,
    paddingBottom: theme.spacing.s,
    gap: theme.spacing.s,
  },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    borderRadius: theme.borderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    gap: theme.spacing.xs,
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary + "30",
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  filterTabText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  filterTabTextActive: {
    color: theme.colors.primaryLight,
  },
  filterBadge: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.full,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  list: {
    padding: theme.spacing.m,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.m,
    paddingTop: theme.spacing.l,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  sectionBadge: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.full,
    minWidth: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  sectionBadgeText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
    minHeight: 300,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  viewAllButton: {
    marginTop: theme.spacing.m,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.primary + "20",
  },
  viewAllText: {
    color: theme.colors.primaryLight,
    fontWeight: "600",
  },
  matchCard: {
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: theme.spacing.m,
  },
  matchCardOpen: {
    borderColor: theme.colors.success + "40",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  matchCardCritical: {
    borderColor: theme.colors.error + "40",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.s,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  matchDate: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: theme.spacing.s,
  },
  spotsSection: {
    marginBottom: theme.spacing.m,
  },
  spotsInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.s,
    gap: theme.spacing.s,
  },
  spotsText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  fillingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  fillingText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  pulsingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    gap: 4,
  },
  pulsingText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  progressBarContainer: {
    marginTop: theme.spacing.xs,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
  },
  detailsRow: {
    flexDirection: "row",
    gap: theme.spacing.s,
    marginBottom: theme.spacing.m,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
  },
  detailChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  joinButtonWrapper: {
    borderRadius: theme.borderRadius.m,
    overflow: "hidden",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.s + 2,
    gap: theme.spacing.xs,
  },
  joinButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.success + "15",
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    borderRadius: theme.borderRadius.m,
  },
  joinedText: {
    color: theme.colors.success,
    fontSize: 14,
    fontWeight: "600",
  },
  loginPrompt: {
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
  },
  loginPromptText: {
    color: theme.colors.primaryLight,
    fontSize: 14,
    fontWeight: "500",
  },
  // Admin action styles
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.s,
  },
  adminActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  adminActionButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.s,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  modalGradient: {
    padding: theme.spacing.l,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.l,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.text,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  modalForm: {
    marginBottom: theme.spacing.l,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing.m,
  },
  modalCancelButton: {
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  modalSaveButtonWrapper: {
    borderRadius: theme.borderRadius.m,
    overflow: "hidden",
  },
  modalSaveButton: {
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
  },
  modalSaveText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
