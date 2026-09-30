import { Platform, Share, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { callFunction, MATCH_KEYS } from './api';
import { formatDate, t } from './i18n';
import { showToast } from './toast';
import { showAlert } from './alert';

function haptic(kind: 'success' | 'error') {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
}

export function useInvalidateMatch() {
  const client = useQueryClient();
  return () => Promise.all(MATCH_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/**
 * M5 M19: "Join match" joins in one tap and offers Undo; "Leave match" is its pair.
 */
export function useJoinLeave() {
  const invalidate = useInvalidateMatch();

  const leave = useMutation({
    mutationFn: (matchId: string) => callFunction<{ promoted?: string | null }>('cancel-signup', { matchId }),
    onSuccess: () => {
      haptic('success');
      void invalidate();
    },
    onError: (error: Error) => {
      haptic('error');
      showAlert(t('common.errorTitle'), error.message);
    },
  });

  const join = useMutation({
    mutationFn: async ({ matchId }: { matchId: string; kickOff: string }) =>
      callFunction<{ state: 'confirmed' | 'waitlist'; position?: number }>('join-match', { matchId }),
    onSuccess: (data, { matchId, kickOff }) => {
      haptic('success');
      void invalidate();
      const when = formatDate.day(kickOff);
      showToast(
        data.state === 'waitlist' ? t('match.toastWaitlist', { position: data.position ?? '?', when }) : t('match.toastJoined', { when }),
        { action: { label: t('common.undo'), onPress: () => leave.mutate(matchId) } }
      );
    },
    onError: (error: Error) => {
      haptic('error');
      showAlert(t('common.errorTitle'), error.message);
    },
  });

  return { join, leave };
}

/** T7: share squads and teams to the group's WhatsApp instead of a second chat. */
export async function shareToWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener');
      return;
    }
    // wa.me opens the WhatsApp app when installed and the web client otherwise.
    await Linking.openURL(url);
  } catch {
    await Share.share({ message: text });
  }
}
