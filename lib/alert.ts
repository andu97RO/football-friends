/**
 * Cross-platform alert dialogs.
 *
 * `Alert.alert` from react-native is a no-op in react-native-web, so on web the
 * request is handed to `<AlertHost />` (mounted in the root layout) instead.
 */
import { Alert, Platform } from 'react-native';

export type AppAlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type AppAlertRequest = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};

type Listener = (request: AppAlertRequest | null) => void;

const listeners = new Set<Listener>();
const queue: AppAlertRequest[] = [];
let current: AppAlertRequest | null = null;

function emit() {
  listeners.forEach((listener) => listener(current));
}

/**
 * Subscribes to the currently visible alert request. The listener is invoked
 * immediately with the current value and on every subsequent change.
 * @returns An unsubscribe function.
 */
export function subscribeToAlerts(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Closes the visible alert and shows the next queued one, if any.
 */
export function dismissCurrentAlert(): void {
  current = queue.shift() ?? null;
  emit();
}

/**
 * Shows an alert dialog. Mirrors the `Alert.alert` signature so it can be used
 * as a drop-in replacement: native platforms get the OS dialog, web gets an
 * in-app modal. Defaults to a single "OK" button when none are provided.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[]
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const request: AppAlertRequest = {
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
  };

  if (current) {
    queue.push(request);
    return;
  }

  current = request;
  emit();
}
