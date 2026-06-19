import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { supabase } from '@/src/lib/supabase';
import { fetchIsAdmin } from '@/src/lib/fetchIsAdmin';
import { signInWithGoogleOAuth } from '@/src/lib/signInWithGoogle';
import { Platform } from 'react-native';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('@/src/lib/fetchIsAdmin', () => ({
  fetchIsAdmin: jest.fn(),
}));

jest.mock('@/src/lib/signInWithGoogle', () => ({
  signInWithGoogleOAuth: jest.fn(),
  handleOAuthDeepLink: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  useURL: jest.fn().mockReturnValue(null),
  addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
}));

describe('AuthContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
  });

  describe('Initialization', () => {
    it('initializes with session and fetches admin status', async () => {
      const mockSession = { user: { id: 'u1', email: 'test@test.com' } };
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: mockSession } });
      (fetchIsAdmin as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.session).toEqual(mockSession);
        expect(result.current.user).toEqual(mockSession.user);
        expect(result.current.isAdmin).toBe(true);
      });
      expect(fetchIsAdmin).toHaveBeenCalledWith('u1', 'test@test.com');
    });

    it('throws if used outside provider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider');
      consoleError.mockRestore();
    });
  });

  describe('Methods', () => {
    it('signIn calls supabase and fetches admin', async () => {
      const mockSession = { user: { id: 'u2', email: 'user2@test.com' } };
      (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ data: mockSession, error: null });
      (fetchIsAdmin as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signIn('user2@test.com', 'pass');
      });

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'user2@test.com', password: 'pass' });
      expect(fetchIsAdmin).toHaveBeenCalledWith('u2', 'user2@test.com');
      expect(res).toEqual({ error: null, isAdmin: false });
    });

    it('signUp calls supabase', async () => {
      (supabase.auth.signUp as jest.Mock).mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signUp('user@test.com', 'pass', 'tester');
      });

      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'pass',
        options: { data: { username: 'tester' } },
      });
      expect(res).toEqual({ error: null });
    });

    it('resetPassword calls supabase with correct redirect based on platform', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({ error: null });
      Platform.OS = 'ios';

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.resetPassword('test@test.com');
      });

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@test.com', {
        redirectTo: 'cardly://auth/reset-password',
      });
    });

    it('updatePassword calls supabase updateUser', async () => {
      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.updatePassword('newpass');
      });

      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass' });
    });

    it('signOut calls supabase signOut and clears admin', async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signOut();
      });

      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(result.current.isAdmin).toBe(false);
    });

    it('signInWithGoogle handles oauth correctly on native', async () => {
      Platform.OS = 'ios';
      (signInWithGoogleOAuth as jest.Mock).mockResolvedValue({ error: null });
      const mockSession = { user: { id: 'u3', email: 'g@test.com' } };
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: mockSession } });
      (fetchIsAdmin as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signInWithGoogle();
      });

      expect(signInWithGoogleOAuth).toHaveBeenCalled();
      expect(fetchIsAdmin).toHaveBeenCalledWith('u3', 'g@test.com');
      expect(res).toEqual({ error: null, isAdmin: true });
    });
  });
});
