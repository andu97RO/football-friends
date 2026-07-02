/**
 * Expo Push Notifications Setup
 * Handles registration, permissions, and notification handling
 */
import { useState, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * Requests notification permissions (if needed).
 * @returns True if permissions are granted; otherwise false.
 */
export async function ensureNotificationPermissionsAsync(): Promise<boolean> {
  // Web doesn't support Expo notifications in the same way as native
  if (Platform.OS === "web") return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Schedules a local notification to validate that notification permissions and foreground handling work.
 * This does NOT require Expo Push / a push token.
 */
export async function scheduleLocalTestNotificationAsync(options?: {
  title?: string;
  body?: string;
  secondsFromNow?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (Platform.OS === "web") {
      return {
        success: false,
        error: "Notifications are not supported on web.",
      };
    }

    const granted = await ensureNotificationPermissionsAsync();
    if (!granted)
      return { success: false, error: "Notification permissions not granted." };

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#10b981",
      });
    }

    const seconds = options?.secondsFromNow ?? 2;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options?.title ?? "Football Friends",
        body: options?.body ?? "This is a local test notification.",
        sound: "default",
        data: { type: "local-test" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Configure how notifications are handled when app is in foreground
 */
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Register device for push notifications and save token to database
 * @param userId - The user's ID to associate with the push token
 * @returns The Expo push token or null if registration failed
 */
export async function registerForPushNotificationsAsync(
  userId: string
): Promise<string | null> {
  // On simulators, we can't get a real push token, but we can still set up local notifications
  if (!Device.isDevice) {
    console.log(
      "Push notifications require a physical device. Local notifications will still work."
    );
    // Set up Android notification channel even on simulator for local notifications
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#10b981",
      });
    }
    return null;
  }

  // Web doesn't support Expo Push Notifications
  if (Platform.OS === "web") {
    console.log("Push notifications are not supported on web");
    return null;
  }

  try {
    const granted = await ensureNotificationPermissionsAsync();
    if (!granted) {
      console.log("Push notification permissions not granted");
      return null;
    }

    // Get the Expo push token
    // For Expo Go (development), projectId is optional and will use experienceId from app.json
    // For production builds, EAS will automatically provide the projectId
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Save token to database
    const { error } = await supabase
      .from("profile")
      .update({ push_token: token })
      .eq("user_id", userId);

    if (error) {
      console.error("Error saving push token:", error);
      return null;
    }

    // Configure Android notification channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#10b981", // Brand green color
      });
    }

    return token;
  } catch (error) {
    console.error("Error registering for push notifications:", error);
    return null;
  }
}

/**
 * Send a push notification via Expo Push API
 * This should be called from Edge Functions (server-side)
 * @param pushToken - The recipient's Expo push token
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Additional data to send with notification
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  const message = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data: data || {},
    priority: "high",
    channelId: "default",
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (!response.ok || result.data?.status === "error") {
      return {
        success: false,
        error: result.data?.message || "Failed to send notification",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending push notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Helper function to send notification to a specific user
 * Fetches their push token from database and sends notification
 * Falls back to local notification on simulators (for testing)
 * @param userId - The user's ID
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Additional data
 */
export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch user's push token
    const { data: profile, error } = await supabase
      .from("profile")
      .select("push_token")
      .eq("user_id", userId)
      .single();

    if (error || !profile?.push_token) {
      // On simulator/development, fall back to local notification for testing
      if (!Device.isDevice && Platform.OS !== "web") {
        console.log("No push token - using local notification fallback for testing");
        return await scheduleLocalTestNotificationAsync({
          title,
          body,
          secondsFromNow: 1,
        });
      }

      return {
        success: false,
        error: "User push token not found. Push notifications require a physical device.",
      };
    }

    // Send notification
    return await sendPushNotification(profile.push_token, title, body, data);
  } catch (error) {
    console.error("Error sending notification to user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Remove push token from database (e.g., on logout)
 * @param userId - The user's ID
 */
export async function unregisterPushNotifications(
  userId: string
): Promise<void> {
  try {
    await supabase
      .from("profile")
      .update({ push_token: null })
      .eq("user_id", userId);
  } catch (error) {
    console.error("Error unregistering push notifications:", error);
  }
}
