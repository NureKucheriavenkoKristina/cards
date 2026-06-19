import Constants from 'expo-constants';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/src/lib/supabase';

function isInvalidRedirectUri(uri: string | undefined | null): boolean {
  if (!uri || uri === 'null' || uri.includes('null://') || uri.includes('://null')) {
    return true;
  }
  return !uri.includes('://');
}

/**
 * Redirect URI for Supabase OAuth.
 * Expo Go cannot use the custom `cardly://` scheme — must use Metro `exp://` deep link.
 */
export function getGoogleOAuthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }

  // Expo Go: custom scheme is not registered → use Linking / exp:// (avoids redirect_to=null).
  if (Constants.appOwnership === 'expo') {
    const expUri = Linking.createURL('/');
    if (!isInvalidRedirectUri(expUri)) return expUri;
  }

  const nativeUri = makeRedirectUri({ scheme: 'cardly', path: '' });
  if (!isInvalidRedirectUri(nativeUri)) return nativeUri;

  const fallback = Linking.createURL('/');
  if (!isInvalidRedirectUri(fallback)) return fallback;

  throw new Error('OAuth redirect URI could not be determined');
}

/**
 * Exchanges tokens or auth code from the OAuth callback URL for a Supabase session.
 * @see https://supabase.com/docs/guides/auth/native-mobile-deep-linking
 */
export async function createSessionFromOAuthUrl(url: string): Promise<{ error: Error | null }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    return { error: new Error(errorCode) };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return { error: error ?? null };
  }

  const access_token = params.access_token;
  const refresh_token = params.refresh_token;
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return { error: error ?? null };
  }

  return { error: new Error('OAuth session missing') };
}

/**
 * Starts Supabase Google OAuth. On web, the client redirects the browser.
 * On native (including Expo Go), opens an auth session and completes via deep link.
 */
export async function signInWithGoogleOAuth(): Promise<{ error: Error | null }> {
  try {
    const redirectTo = getGoogleOAuthRedirectUri();

    if (__DEV__) {
      console.log('[auth] Google OAuth redirectTo (add to Supabase → Auth → URL Configuration):', redirectTo);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });

    if (error) return { error };

    if (Platform.OS === 'web') {
      return { error: null };
    }

    if (!data?.url || data.url.includes('redirect_to=null') || data.url.includes('redirect_to=undefined')) {
      return { error: new Error('OAuth redirect URI invalid') };
    }

    if (Platform.OS === 'android') {
      await WebBrowser.warmUpAsync();
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
      showInRecents: true,
    });

    if (result.type === 'success' && result.url) {
      return createSessionFromOAuthUrl(result.url);
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { error: new Error('OAuth cancelled') };
    }

    return { error: new Error('OAuth failed') };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Handles OAuth callback when the app is opened from a deep link (email magic link, OAuth return). */
export async function handleOAuthDeepLink(url: string | null): Promise<void> {
  if (!url || Platform.OS === 'web') return;
  if (!url.includes('code=') && !url.includes('access_token=')) return;

  const { error } = await createSessionFromOAuthUrl(url);
  if (error && __DEV__) {
    console.warn('[auth] deep link session error', error.message);
  }
}
