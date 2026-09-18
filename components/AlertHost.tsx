import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import {
  AppAlertButton,
  AppAlertRequest,
  dismissCurrentAlert,
  subscribeToAlerts,
} from '@/lib/alert';

function testIdFor(button: AppAlertButton, index: number): string {
  const label = button.text?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `alert-button-${label || index}`;
}

function buttonColor(style: AppAlertButton['style']): string {
  if (style === 'destructive') return theme.colors.error;
  if (style === 'cancel') return theme.colors.textSecondary;
  return theme.colors.success;
}

/**
 * Renders alert requests coming from `showAlert` on web, where the native
 * `Alert.alert` dialog does not exist. Mounted once in the root layout.
 */
export default function AlertHost() {
  const [request, setRequest] = useState<AppAlertRequest | null>(null);

  useEffect(() => subscribeToAlerts(setRequest), []);

  if (!request) return null;

  const { title, message, buttons } = request;
  const stacked = buttons.length > 2;

  const handlePress = (button: AppAlertButton) => {
    dismissCurrentAlert();
    button.onPress?.();
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible
      onRequestClose={dismissCurrentAlert}
    >
      <View style={styles.overlay}>
        <View
          style={styles.dialog}
          testID="alert-dialog"
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text style={styles.title} testID="alert-title">
            {title}
          </Text>
          {message ? (
            <Text style={styles.message} testID="alert-message">
              {message}
            </Text>
          ) : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={testIdFor(button, index)}
                testID={testIdFor(button, index)}
                accessibilityRole="button"
                style={[styles.button, stacked && styles.buttonStacked]}
                onPress={() => handlePress(button)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.buttonText, { color: buttonColor(button.style) }]}
                >
                  {button.text || 'OK'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
    padding: theme.spacing.l,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: theme.spacing.l,
    ...theme.shadows.large,
  },
  title: {
    ...theme.typography.h3,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.l,
    gap: theme.spacing.s,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing.m,
    paddingHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceLight,
    alignItems: 'center',
  },
  buttonStacked: {
    flex: 0,
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
