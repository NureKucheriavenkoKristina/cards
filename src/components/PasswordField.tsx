import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { authPasswordWrapStyle } from '@/src/components/authFormStyles';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';

type PasswordFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export function PasswordField({
  value,
  onChangeText,
  placeholder,
  editable = true,
  containerStyle,
  inputStyle,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();
  const C = useAppColors();

  return (
    <View
      style={[styles.wrap, authPasswordWrapStyle(C), containerStyle]}
    >
      <TextInput
        style={[
          styles.input,
          { color: C.text },
          Platform.OS === 'web'
            ? ({
                outlineStyle: 'none',
                outlineWidth: 0,
                ...(C.isDark
                  ? ({ backgroundColor: 'transparent', boxShadow: `0 0 0 1000px ${C.inputBg} inset`, WebkitTextFillColor: C.text } as TextStyle)
                  : ({} as TextStyle)),
              } as TextStyle)
            : null,
          inputStyle,
        ]}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setVisible(v => !v)}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('hidePassword') : t('showPassword')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {visible ? (
          <EyeOff size={20} color={C.textSub} />
        ) : (
          <Eye size={20} color={C.textSub} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 11,
    paddingLeft: 14,
    paddingRight: 6,
    fontSize: 15,
  },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
