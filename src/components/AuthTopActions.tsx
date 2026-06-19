import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ThemeToggle from '@/src/components/ThemeToggle';
import { LanguageDropdown } from '@/src/components/LanguageDropdown';

/** Theme + language controls for auth screens (login, signup). */
export function AuthTopActions() {
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 16 : insets.top + 12;

  return (
    <View style={[styles.root, { top }]}>
      <ThemeToggle />
      <LanguageDropdown />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
