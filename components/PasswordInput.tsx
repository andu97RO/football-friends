import { useState } from 'react';
import { TextInput, TextInputProps, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string;
};

export default function PasswordInput({ label, style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        onPress={() => setVisible(current => !current)}
        style={styles.toggle}
        hitSlop={8}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={theme.colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  input: {
    paddingRight: 52,
  },
  toggle: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
