import { StyleSheet, Text, type TextStyle } from 'react-native';

import type { FlashMessage } from '@/src/hooks/useFlashMessage';

type Props = {
  message: FlashMessage | null;
  style?: TextStyle;
};

/** Inline success/error feedback that auto-dismisses via `useFlashMessage`. */
export function FormFlashMessage({ message, style }: Props) {
  if (!message) return null;
  return (
    <Text
      style={[
        styles.base,
        message.ok ? styles.success : styles.error,
        style,
      ]}
    >
      {message.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  success: {
    color: '#166534',
  },
  error: {
    color: '#dc2626',
  },
});
