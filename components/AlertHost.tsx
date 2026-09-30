import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { AppAlertButton, AppAlertRequest, dismissCurrentAlert, subscribeToAlerts } from '@/lib/alert';
import { Button, Txt } from '@/components/ui';

function testIdFor(button: AppAlertButton, index: number): string {
  const label = button.text?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `alert-button-${label || index}`;
}

const icons = {
  warning: { name: 'alert-circle-outline', color: theme.colors.warning, bg: theme.colors.warningTint },
  danger: { name: 'alert-circle-outline', color: theme.colors.error, bg: theme.colors.errorTint },
  success: { name: 'checkmark', color: theme.colors.onPrimary, bg: theme.colors.primary },
  info: { name: 'information-circle-outline', color: theme.colors.info, bg: theme.colors.surfaceRaised },
} as const;

function variantFor(button: AppAlertButton, index: number, count: number) {
  if (button.style === 'destructive') return 'danger' as const;
  if (button.style === 'primary') return 'primary' as const;
  if (button.style === 'cancel') return 'secondary' as const;
  return count === 1 || index === count - 1 ? ('primary' as const) : ('secondary' as const);
}

/** Renders every `showAlert` / `confirm` request as an in-app dialog. */
export default function AlertHost() {
  const [request, setRequest] = useState<AppAlertRequest | null>(null);

  useEffect(() => subscribeToAlerts(setRequest), []);

  if (!request) return null;

  const { title, message, buttons, icon } = request;
  const iconSpec = icon ? icons[icon] : null;

  const handlePress = (button: AppAlertButton) => {
    dismissCurrentAlert();
    button.onPress?.();
  };

  return (
    <Modal animationType="fade" transparent visible onRequestClose={dismissCurrentAlert} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.dialog} testID="alert-dialog" accessibilityRole="alert" accessibilityViewIsModal>
          {iconSpec && (
            <View style={[styles.icon, { backgroundColor: iconSpec.bg }]}>
              <Ionicons name={iconSpec.name} size={24} color={iconSpec.color} />
            </View>
          )}
          <Txt variant="title" testID="alert-title">{title}</Txt>
          {message ? <Txt variant="body" tone="secondary" testID="alert-message">{message}</Txt> : null}
          <View style={styles.actions}>
            {buttons.map((button, index) => (
              <Button
                key={testIdFor(button, index)}
                testID={testIdFor(button, index)}
                title={button.text || 'OK'}
                variant={variantFor(button, index, buttons.length)}
                onPress={() => handlePress(button)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.overlay, padding: theme.spacing.l },
  dialog: {
    width: '100%',
    maxWidth: 400,
    gap: theme.spacing.s + 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.l,
  },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actions: { gap: theme.spacing.s, marginTop: theme.spacing.s },
});
