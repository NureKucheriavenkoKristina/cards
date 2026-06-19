import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import type { AppColors } from '@/src/contexts/ThemeContext';

type C = AppColors;

/** Compact auth field sizing + dark web autofill override. */
export function authInputStyle(C: C): TextStyle {
  return {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.text,
    marginBottom: 10,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
          // Keep dark autofill fix but don't introduce visible outline
          ...(C.isDark
            ? ({ boxShadow: `0 0 0 1000px ${C.inputBg} inset`, WebkitTextFillColor: C.text } as TextStyle)
            : ({} as TextStyle)),
        } as TextStyle)
      : {}),
  };
}

export function authPasswordWrapStyle(C: C): ViewStyle {
  return {
    backgroundColor: C.inputBg,
    borderColor: C.inputBorder,
    marginBottom: 10,
  };
}

export const authFormStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  googleButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
});
