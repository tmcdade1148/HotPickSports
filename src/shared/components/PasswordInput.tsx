// PasswordInput — a TextInput for passwords with a show/hide eye toggle.
// Default hidden; tap the eye to reveal. Used on the auth/onboarding screens so
// users can verify what they typed. iOS + Android. Colors from useTheme()
// (Hard Rule #9). Forwards all TextInputProps; pass `containerStyle` for spacing
// (e.g. marginTop) and `style` for the input box — the component owns
// secureTextEntry.

import React, {useState} from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {Eye, EyeOff} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';

interface PasswordInputProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>;
}

export function PasswordInput({containerStyle, style, ...props}: PasswordInputProps) {
  const {colors} = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
      />
      <Pressable
        onPress={() => setVisible(v => !v)}
        hitSlop={10}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        {visible ? (
          <EyeOff size={20} color={colors.textSecondary} />
        ) : (
          <Eye size={20} color={colors.textSecondary} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {justifyContent: 'center'},
  // Reserve room on the right so the text never runs under the eye icon.
  input: {paddingRight: 44},
  toggle: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
