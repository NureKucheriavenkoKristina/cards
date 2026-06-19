import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = '@cardly_theme';

interface ThemeContextType {
  colorScheme: ColorScheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemColorScheme() ?? 'light';
  const [colorScheme, setColorScheme] = useState<ColorScheme>(system);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setColorScheme(stored);
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setColorScheme((prev) => {
      const next: ColorScheme = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ colorScheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Convenience hook — returns a set of theme-aware color tokens ready to use in styles. */
export function useAppColors() {
  const { colorScheme: cs } = useTheme();
  const isDark = cs === 'dark';
  return {
    cs,
    isDark,
    bg:           isDark ? '#151c2e' : '#f3f4f6',
    surface:      isDark ? '#1d2a3a' : '#ffffff',
    surfaceAlt:   isDark ? '#243547' : '#f7f8fb',
    text:         isDark ? '#edf4fe' : '#111827',
    /** Secondary copy — brighter in dark mode for WCAG-friendly contrast on navy surfaces */
    textSub:      isDark ? '#c8d0e0' : '#6b7280',
    textMuted:    isDark ? '#9fb0c8' : '#9ca3af',
    border:       isDark ? '#2d3f55' : '#e5e7eb',
    borderLight:  isDark ? '#243547' : '#f3f4f6',
    inputBg:      isDark ? '#243547' : '#f7f8fb',
    inputBorder:  isDark ? '#2d3f55' : '#e8eaee',
    placeholder:  isDark ? '#6b7280' : '#c4cbd8',
    tint:         isDark ? '#6366f1' : '#4255ff',
    iconTint:     isDark ? '#a7b6f7' : '#4255ff',
    iconBg:       isDark ? '#eef2fe' : '#EEF2FF',
    /** Outlined AI chips (deck actions, add-card labels) */
    aiAccentBg:     isDark ? 'rgba(99,102,241,0.22)' : '#eef0ff',
    aiAccentBorder: isDark ? 'rgba(165,180,252,0.5)' : 'rgba(99,102,241,0.28)',
    /** Filled primary AI CTA — keeps white label readable in dark mode */
    aiButtonFill:   isDark ? '#6366f1' : '#4255ff',
  } as const;
}

export type AppColors = ReturnType<typeof useAppColors>;
