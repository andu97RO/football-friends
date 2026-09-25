import { useGroups } from '@/lib/groups';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { showAlert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/auth-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  scheduleLocalTestNotificationAsync,
  sendNotificationToUser,
  unregisterPushNotifications,
} from "@/lib/notifications";
import { ensureProfile } from "@/lib/ensure-profile";
import PasswordInput from "@/components/PasswordInput";

export default function ProfileScreen() {
  const { session, setSession } = useAuthStore();
  const queryClient = useQueryClient();

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const { current } = useGroups();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      return ensureProfile(session.user.id, session.user.email);
    },
    enabled: !!session?.user?.id,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: {
      display_name: string;
      avatar_url?: string;
    }) => {
      if (!session?.user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profile")
        .update(updates)
        .eq("user_id", session.user.id)
        .select("user_id,display_name,avatar_url,created_at")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setShowEditModal(false);
      showAlert("Success", "Profile updated successfully");
    },
    onError: (error: any) => {
      showAlert("Error", error.message);
    },
  });

  const handleEditPress = () => {
    if (profile) {
      setEditName(profile.display_name);
      setEditAvatar(profile.avatar_url || null);
      setShowEditModal(true);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0].uri) {
        uploadAvatar(result.assets[0].uri);
      }
    } catch {
      showAlert("Error", "Failed to pick image");
    }
  };

  const uploadAvatar = async (uri: string) => {
    try {
      setUploading(true);

      // Convert URI to Blob
      const response = await fetch(uri);
      const blob = await response.blob();

      if (blob.size > 2 * 1024 * 1024) throw new Error('Choose an image under 2 MB');
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      if (!extensions[blob.type]) throw new Error('Choose a JPEG, PNG or WebP image');
      const fileName = `${session?.user?.id}/${Date.now()}.${extensions[blob.type]}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, {
          contentType: blob.type,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error details:", uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setEditAvatar(data.publicUrl);
    } catch (error: any) {
      console.error("Full error:", error);
      showAlert(
        "Error",
        `Error uploading image: ${error.message || "Unknown error"}`
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      display_name: editName,
      avatar_url: editAvatar || undefined,
    });
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      showAlert("Error", "Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert("Error", "Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      showAlert("Error", "Password must be at least 6 characters");
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      showAlert("Success", "Your password has been updated successfully.");
      setShowPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      showAlert("Error", error.message || "Failed to update password");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSignOut = () => {
    const performSignOut = async () => {
      // Clear the push token so a future user of this device doesn't keep
      // receiving notifications meant for this account.
      if (session?.user?.id) {
        await unregisterPushNotifications(session.user.id);
      }
      // Clear all React Query cache to prevent stale data on next login
      queryClient.clear();
      await supabase.auth.signOut();
      setSession(null);
      // Navigation is handled by auth guards in layouts (prevents navigating before RootLayout mounts).
    };

    showAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: performSignOut,
      },
    ]);
  };

  const handleTestLocalNotification = async () => {
    if (Platform.OS === "web") {
      showAlert("Not supported", "Notifications are not supported on web.");
      return;
    }

    setNotificationLoading(true);
    try {
      const result = await scheduleLocalTestNotificationAsync({
        title: "Football Friends",
        body: "Local notification test (should appear in ~2s).",
        secondsFromNow: 2,
      });

      if (!result.success) {
        showAlert(
          "Notification test failed",
          result.error || "Unknown error"
        );
        return;
      }

      showAlert("Scheduled", "A local test notification was scheduled.");
    } finally {
      setNotificationLoading(false);
    }
  };

  const handleTestPushNotification = async () => {
    if (!session?.user?.id) {
      showAlert("Error", "Not authenticated.");
      return;
    }

    if (Platform.OS === "web") {
      showAlert(
        "Not supported",
        "Push notifications are not supported on web."
      );
      return;
    }

    setNotificationLoading(true);
    try {
      const result = await sendNotificationToUser(
        session.user.id,
        "Football Friends",
        "Push notification test."
      );

      if (!result.success) {
        showAlert(
          "Push test failed",
          result.error ||
            "No push token found. Make sure you are on a physical device using a development build, and you have allowed notifications."
        );
        return;
      }

      showAlert("Sent", "A test push notification was sent.");
    } finally {
      setNotificationLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.text }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.colors.background, "#1e1b4b"]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={styles.profileSection}
        >
          <TouchableOpacity onPress={handleEditPress} activeOpacity={0.8}>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.secondary]}
                style={styles.avatarGradient}
              >
                {profile?.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarText}>
                    {profile?.display_name?.charAt(0).toUpperCase() || "P"}
                  </Text>
                )}
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={12} color="#fff" />
                </View>
              </LinearGradient>
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{profile?.display_name || "Player"}</Text>
          <Text style={styles.email}>{session?.user?.email}</Text>

          <View style={styles.profileButtons}>
            <TouchableOpacity
              onPress={handleEditPress}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowPasswordModal(true)}
              style={styles.editButton}
            >
              <Ionicons
                name="key-outline"
                size={14}
                color={theme.colors.primaryLight}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.editButtonText}>Change Password</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.statsSection}
        >
          <BlurView intensity={20} tint="dark" style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons name="star" size={24} color={theme.colors.warning} />
              <Text style={styles.statTitle}>Player Rating</Text>
            </View>
            <Text style={styles.statValue}>{current?.rating ?? "—"}</Text>
            <Text style={styles.statLabel}>Base Rating</Text>
          </BlurView>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(250).springify()}
          style={styles.statsSection}
        >
          <BlurView intensity={20} tint="dark" style={styles.statCard}>
            <View style={styles.statHeader}>
              <Ionicons
                name="notifications"
                size={24}
                color={theme.colors.primaryLight}
              />
              <Text style={styles.statTitle}>Notifications</Text>
            </View>

            <TouchableOpacity
              onPress={handleTestLocalNotification}
              style={styles.editButton}
              disabled={notificationLoading}
              activeOpacity={0.8}
            >
              <Ionicons
                name="alarm-outline"
                size={14}
                color={theme.colors.primaryLight}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.editButtonText}>
                {notificationLoading
                  ? "Please wait…"
                  : "Test local notification"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleTestPushNotification}
              style={[styles.editButton, { marginTop: theme.spacing.s }]}
              disabled={notificationLoading}
              activeOpacity={0.8}
            >
              <Ionicons
                name="send-outline"
                size={14}
                color={theme.colors.primaryLight}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.editButtonText}>
                {notificationLoading
                  ? "Please wait…"
                  : "Test push notification"}
              </Text>
            </TouchableOpacity>
          </BlurView>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[theme.colors.error, "#991b1b"]}
              style={styles.signOutGradient}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showEditModal}
        onRequestClose={() => setShowEditModal(false)}
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
              <Text style={styles.modalTitle}>Edit Profile</Text>

              <TouchableOpacity
                onPress={pickImage}
                style={styles.modalAvatarContainer}
              >
                {editAvatar ? (
                  <Image
                    source={{ uri: editAvatar }}
                    style={styles.modalAvatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.modalAvatar,
                      { backgroundColor: theme.colors.primary },
                    ]}
                  >
                    <Text style={styles.avatarText}>
                      {editName?.charAt(0).toUpperCase() || "P"}
                    </Text>
                  </View>
                )}
                <View style={styles.modalEditBadge}>
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Display Name</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter your name"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSaveProfile}
                  disabled={updateProfileMutation.isPending || uploading}
                >
                  <LinearGradient
                    colors={[theme.colors.primary, theme.colors.secondary]}
                    style={styles.saveButtonGradient}
                  >
                    <Text style={styles.saveButtonText}>
                      {updateProfileMutation.isPending ? "Saving..." : "Save"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showPasswordModal}
        onRequestClose={() => setShowPasswordModal(false)}
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
              <View style={styles.passwordIconContainer}>
                <Ionicons name="key" size={32} color={theme.colors.success} />
              </View>
              <Text style={styles.modalTitle}>Change Password</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>New Password</Text>
                <PasswordInput
                  label="New Password"
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={theme.colors.textSecondary}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <PasswordInput
                  label="Confirm Password"
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={theme.colors.textSecondary}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowPasswordModal(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleChangePassword}
                  disabled={passwordLoading}
                >
                  <LinearGradient
                    colors={[theme.colors.success, "#059669"]}
                    style={styles.saveButtonGradient}
                  >
                    <Text style={styles.saveButtonText}>
                      {passwordLoading ? "Updating..." : "Update"}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.l,
  },
  contentContainer: {
    paddingBottom: 120,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: theme.spacing.xxl,
    marginTop: theme.spacing.xl,
  },
  avatarContainer: {
    marginBottom: theme.spacing.m,
    ...theme.shadows.large,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#fff",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  name: {
    fontSize: 28,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.m,
  },
  profileButtons: {
    flexDirection: "row",
    gap: theme.spacing.s,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: theme.borderRadius.full,
  },
  editButtonText: {
    color: theme.colors.primaryLight,
    fontWeight: "600",
    fontSize: 14,
  },
  passwordIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.m,
  },
  statsSection: {
    marginBottom: theme.spacing.xxl,
  },
  statCard: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.l,
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.s,
    gap: 8,
  },
  statTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
  },
  statValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  signOutButton: {
    borderRadius: theme.borderRadius.l,
    overflow: "hidden",
    ...theme.shadows.medium,
  },
  signOutGradient: {
    padding: theme.spacing.m,
    alignItems: "center",
  },
  signOutText: {
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
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: theme.spacing.l,
  },
  modalAvatarContainer: {
    position: "relative",
    marginBottom: theme.spacing.l,
  },
  modalAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  modalEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  inputContainer: {
    width: "100%",
    marginBottom: theme.spacing.xl,
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    color: theme.colors.text,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: theme.spacing.m,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    borderRadius: theme.borderRadius.m,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontWeight: "600",
    fontSize: 16,
  },
  saveButton: {
    ...theme.shadows.medium,
  },
  saveButtonGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
