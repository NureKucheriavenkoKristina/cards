import { useTheme } from '@/src/contexts/ThemeContext';

export function useColorScheme() {
  return useTheme().colorScheme;
}
