import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import Colors from '@/src/constants/Colors';

export default function ThemeToggle() {
  const { colorScheme, toggleTheme } = useTheme();
  const iconColor = Colors[colorScheme].tint;

  return (
    <Pressable
      onPress={toggleTheme}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.5 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={colorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Feather
        name={colorScheme === 'dark' ? 'sun' : 'moon'}
        size={20}
        color={iconColor}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 8 },
});
