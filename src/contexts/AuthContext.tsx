import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { fetchIsAdmin } from '@/src/lib/fetchIsAdmin';
import { handleOAuthDeepLink, signInWithGoogleOAuth } from '@/src/lib/signInWithGoogle';
import { supabase } from '@/src/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** From profiles.isAdmin or users.isAdmin; false if missing or logged out. */
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any; isAdmin?: boolean }>;
  /** Supabase Google OAuth (configured in Dashboard → Auth → Providers). */
  signInWithGoogle: () => Promise<{ error: any; isAdmin?: boolean }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  /** Request password reset email */
  resetPassword: (email: string) => Promise<{ error: any }>;
  /** Update password with new value (for password reset flow or authenticated user) */
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      setIsAdmin(await fetchIsAdmin(s?.user?.id, s?.user?.email));
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      (async () => {
        setSession(s);
        setUser(s?.user ?? null);
        setIsAdmin(await fetchIsAdmin(s?.user?.id, s?.user?.email));
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Complete OAuth when returning to the app via deep link (Expo Go / native).
  const linkingUrl = Linking.useURL();
  useEffect(() => {
    if (linkingUrl) void handleOAuthDeepLink(linkingUrl);
  }, [linkingUrl]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleOAuthDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error };
    }
    const uid = data.user?.id;
    const admin = await fetchIsAdmin(uid, data.user?.email);
    setIsAdmin(admin);
    return { error: null, isAdmin: admin };
  };

  const signInWithGoogle = async () => {
    const { error } = await signInWithGoogleOAuth();
    if (error) {
      return { error };
    }
    if (Platform.OS === 'web') {
      return { error: null };
    }
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s) {
      return { error: new Error('OAuth session missing') };
    }
    setSession(s);
    setUser(s.user);
    const admin = await fetchIsAdmin(s.user.id, s.user.email);
    setIsAdmin(admin);
    return { error: null, isAdmin: admin };
  };

  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Platform.OS === 'web' 
        ? `${window.location.origin}/auth/reset-password`
        : 'cardly://auth/reset-password',
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const signOut = async () => {
    setIsAdmin(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAdmin,
        signIn,
        signInWithGoogle,
        signUp,
        resetPassword,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
