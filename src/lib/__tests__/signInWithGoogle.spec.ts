import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '@/src/lib/supabase';
import { signInWithGoogleOAuth, createSessionFromOAuthUrl, getGoogleOAuthRedirectUri, handleOAuthDeepLink } from '../signInWithGoogle';

jest.mock('expo-constants', () => ({
  appOwnership: 'standalone',
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn().mockReturnValue('cardly://'),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn().mockReturnValue('exp://127.0.0.1:19000'),
}));

jest.mock('expo-web-browser', () => ({
  warmUpAsync: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-auth-session/build/QueryParams', () => ({
  getQueryParams: jest.fn(),
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
  },
}));

describe('signInWithGoogle', () => {
  const originalDev = (global as any).__DEV__;

  beforeAll(() => {
    (global as any).__DEV__ = false;
  });

  afterAll(() => {
    if (originalDev !== undefined) {
      (global as any).__DEV__ = originalDev;
    } else {
      delete (global as any).__DEV__;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGoogleOAuthRedirectUri', () => {
    it('returns native uri for standalone apps', () => {
      Platform.OS = 'ios';
      expect(getGoogleOAuthRedirectUri()).toBe('cardly://');
    });

    it('returns web origin if Platform is web', () => {
      Platform.OS = 'web';
      // jsdom provides window
      expect(getGoogleOAuthRedirectUri()).toBe('http://localhost/');
    });
  });

  describe('createSessionFromOAuthUrl', () => {
    it('handles errorCode', async () => {
      (QueryParams.getQueryParams as jest.Mock).mockReturnValue({
        params: {},
        errorCode: 'some_error',
      });
      const res = await createSessionFromOAuthUrl('some://url');
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error?.message).toBe('some_error');
    });

    it('exchanges code for session if code is present', async () => {
      (QueryParams.getQueryParams as jest.Mock).mockReturnValue({
        params: { code: 'auth-code' },
      });
      (supabase.auth.exchangeCodeForSession as jest.Mock).mockResolvedValue({ error: null });

      const res = await createSessionFromOAuthUrl('some://url?code=auth-code');
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('auth-code');
      expect(res.error).toBeNull();
    });

    it('sets session if tokens are present', async () => {
      (QueryParams.getQueryParams as jest.Mock).mockReturnValue({
        params: { access_token: 'acc', refresh_token: 'ref' },
      });
      (supabase.auth.setSession as jest.Mock).mockResolvedValue({ error: null });

      const res = await createSessionFromOAuthUrl('some://url#access_token=acc&refresh_token=ref');
      expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'acc', refresh_token: 'ref' });
      expect(res.error).toBeNull();
    });
    
    it('returns error if neither code nor tokens are present', async () => {
      (QueryParams.getQueryParams as jest.Mock).mockReturnValue({
        params: {},
      });
      const res = await createSessionFromOAuthUrl('some://url');
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error?.message).toBe('OAuth session missing');
    });
  });

  describe('signInWithGoogleOAuth', () => {
    it('handles signInWithOAuth error', async () => {
      Platform.OS = 'ios';
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('supabase auth error'),
      });

      const res = await signInWithGoogleOAuth();
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error?.message).toBe('supabase auth error');
    });

    it('returns early on web without opening WebBrowser', async () => {
      Platform.OS = 'web';
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: { url: 'https://auth.url' },
        error: null,
      });

      const res = await signInWithGoogleOAuth();
      expect(res.error).toBeNull();
      expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    });

    it('handles invalid redirect urls in response', async () => {
      Platform.OS = 'ios';
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: { url: 'https://auth.url?redirect_to=null' },
        error: null,
      });

      const res = await signInWithGoogleOAuth();
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error?.message).toBe('OAuth redirect URI invalid');
    });

    it('handles browser cancel', async () => {
      Platform.OS = 'ios';
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: { url: 'https://auth.url' },
        error: null,
      });
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });

      const res = await signInWithGoogleOAuth();
      expect(res.error).toBeInstanceOf(Error);
      expect(res.error?.message).toBe('OAuth cancelled');
    });

    it('handles successful auth session', async () => {
      Platform.OS = 'ios';
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
        data: { url: 'https://auth.url' },
        error: null,
      });
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'cardly://#access_token=acc&refresh_token=ref' });
      (QueryParams.getQueryParams as jest.Mock).mockReturnValue({
        params: { access_token: 'acc', refresh_token: 'ref' },
      });
      (supabase.auth.setSession as jest.Mock).mockResolvedValue({ error: null });

      const res = await signInWithGoogleOAuth();
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled();
      expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'acc', refresh_token: 'ref' });
      expect(res.error).toBeNull();
    });
  });

  describe('handleOAuthDeepLink', () => {
    it('returns early if web', async () => {
      Platform.OS = 'web';
      await handleOAuthDeepLink('some://url?code=123');
      expect(QueryParams.getQueryParams).not.toHaveBeenCalled();
    });

    it('calls createSessionFromOAuthUrl if valid native deep link', async () => {
      Platform.OS = 'ios';
      (QueryParams.getQueryParams as jest.Mock).mockReturnValue({
        params: { code: '123' },
      });
      (supabase.auth.exchangeCodeForSession as jest.Mock).mockResolvedValue({ error: null });

      await handleOAuthDeepLink('cardly://?code=123');
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('123');
    });
  });
});
