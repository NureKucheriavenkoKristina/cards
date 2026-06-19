import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme, useAppColors } from '../ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useSystemColorScheme } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('react-native', () => ({
  useColorScheme: jest.fn(),
}));

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
  );

  describe('ThemeProvider and useTheme', () => {
    it('initializes with system color scheme if nothing in storage', async () => {
      (useSystemColorScheme as jest.Mock).mockReturnValue('dark');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.colorScheme).toBe('dark');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('@cardly_theme');
    });

    it('initializes with stored color scheme if available', async () => {
      (useSystemColorScheme as jest.Mock).mockReturnValue('light');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('dark');

      const { result } = renderHook(() => useTheme(), { wrapper });

      // Initially it's system (light)
      expect(result.current.colorScheme).toBe('light');

      // But then it resolves async storage
      await waitFor(() => {
        expect(result.current.colorScheme).toBe('dark');
      });
    });

    it('toggles theme and saves to AsyncStorage', async () => {
      (useSystemColorScheme as jest.Mock).mockReturnValue('light');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.colorScheme).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.colorScheme).toBe('dark');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@cardly_theme', 'dark');

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.colorScheme).toBe('light');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@cardly_theme', 'light');
    });

    it('throws error if useTheme used outside provider', () => {
      // Suppress console.error for expected throw
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within ThemeProvider');
      consoleError.mockRestore();
    });
  });

  describe('useAppColors', () => {
    it('returns light colors when theme is light', () => {
      (useSystemColorScheme as jest.Mock).mockReturnValue('light');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useAppColors(), { wrapper });

      expect(result.current.isDark).toBe(false);
      expect(result.current.bg).toBe('#f3f4f6');
    });

    it('returns dark colors when theme is dark', async () => {
      (useSystemColorScheme as jest.Mock).mockReturnValue('dark');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('dark');

      const { result } = renderHook(() => useAppColors(), { wrapper });

      await waitFor(() => {
        expect(result.current.isDark).toBe(true);
        expect(result.current.bg).toBe('#151c2e');
      });
    });
  });
});
