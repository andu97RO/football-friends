/**
 * In-app dialogs. Every platform uses `<AlertHost />` (mounted in the root layout)
 * so confirmations look the same on iOS, Android and web and can carry an icon
 * and paired verbs ("Keep my spot" / "Leave match").
 */
export type AppAlertButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  onPress?: () => void;
};

export type AppAlertRequest = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  icon?: 'warning' | 'danger' | 'success' | 'info';
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
 * Shows an alert dialog with the `Alert.alert` signature. Defaults to a single
 * "OK" button when none are provided.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  icon?: AppAlertRequest['icon']
): void {
  const request: AppAlertRequest = {
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    icon,
  };

  if (current) {
    queue.push(request);
    return;
  }

  current = request;
  emit();
}

/** Resolves true when the confirming (non-cancel) button is pressed. */
export function confirm(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  icon?: AppAlertRequest['icon'];
}): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel, style: options.destructive ? 'primary' : 'cancel', onPress: () => resolve(false) },
        { text: options.confirmLabel, style: options.destructive ? 'destructive' : 'primary', onPress: () => resolve(true) },
      ],
      options.icon ?? (options.destructive ? 'danger' : undefined)
    );
  });
}
