import { Platform } from 'react-native';

/**
 * Android uses softwareKeyboardLayoutMode "resize" (app.json) — the window already
 * shrinks for the keyboard. Extra KeyboardAvoidingView "height" causes layout thrash
 * and focus jumping between fields.
 */
export function keyboardAvoidingBehavior(): 'padding' | undefined {
  return Platform.OS === 'ios' ? 'padding' : undefined;
}
