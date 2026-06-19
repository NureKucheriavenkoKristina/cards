import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { AuthTopActions } from '@/src/components/AuthTopActions';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { authFormStyles } from '@/src/components/authFormStyles';
import { PasswordField } from '@/src/components/PasswordField';
import { mapAuthErrorMessage } from '@/src/lib/mapAuthError';
import { keyboardAvoidingBehavior } from '@/src/lib/keyboardAvoiding';
import { supabase } from '@/src/lib/supabase';

function isRecoveryUrl(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const hash = window.location.hash;
  const search = window.location.search;
  return hash.includes('type=recovery') || search.includes('type=recovery');
}

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);

  const { updatePassword } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const C = useAppColors();

  useEffect(() => {
    let cancelled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setIsValidToken(true);
        setCheckingToken(false);
      }
    });

    (async () => {
      if (isRecoveryUrl()) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session) {
          setIsValidToken(true);
        }
      }
      if (!cancelled) setCheckingToken(false);
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async () => {
    if (!password.trim()) {
      setError(t('passwordRequired'));
      return;
    }

    if (password.length < 6) {
      setError(t('passwordMinLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);
    setError('');

    const { error: updateError } = await updatePassword(password);

    if (updateError) {
      const message = mapAuthErrorMessage(updateError, t);
      setError(message || t('unexpectedError'));
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(async () => {
        await supabase.auth.signOut();
        router.replace('/auth/login' as never);
      }, 1500);
    }
  };

  if (checkingToken) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.tint} />
        <Text style={[styles.loadingText, { color: C.textSub, marginTop: 12 }]}>
          {t('verifyingResetLink')}
        </Text>
      </View>
    );
  }

  if (!isValidToken) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg, padding: 24 }]}>
        <AuthTopActions />
        <Text style={[styles.errorTitle, { color: C.text }]}>{t('invalidResetLink')}</Text>
        <Text style={[styles.errorMessage, { color: C.textSub, marginTop: 12 }]}>
          {t('invalidResetLinkHint')}
        </Text>
        <TouchableOpacity
          style={[authFormStyles.button, styles.button, { backgroundColor: C.tint, marginTop: 20 }]}
          onPress={() => router.replace('/auth/forgot-password' as never)}
        >
          <Text style={styles.buttonText}>{t('requestNewLink')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backLink}
          onPress={() => router.replace('/auth/login' as never)}
        >
          <Text style={[{ color: C.tint, fontSize: 14 }]}>{t('backToSignIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.bg }]}
      behavior={keyboardAvoidingBehavior()}
    >
      <AuthTopActions />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      >
        <View style={styles.content}>
          <View style={authFormStyles.header}>
            <Text style={[authFormStyles.title, { color: C.text }]}>{t('createNewPassword')}</Text>
            <Text style={[authFormStyles.subtitle, { color: C.textSub, marginTop: 8 }]}>
              {t('createNewPasswordDesc')}
            </Text>
          </View>

          {!success ? (
            <View style={styles.form}>
              <PasswordField
                placeholder={t('newPassword')}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />

              <PasswordField
                placeholder={t('confirmPassword')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
              />

              <View style={styles.errorHolder}>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>

              <TouchableOpacity
                style={[authFormStyles.button, styles.button, { backgroundColor: C.tint }, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{t('resetPassword')}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.form, styles.successContainer]}>
              <Text style={[styles.successText, { color: C.text }]}>✓ {t('passwordResetSuccess')}</Text>
              <Text style={[styles.successSubtext, { color: C.textSub }]}>
                {t('passwordResetSuccessHint')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  form: {
    width: '100%',
    marginTop: 20,
  },
  button: {
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorHolder: {
    marginTop: 12,
    minHeight: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  backLink: {
    marginTop: 16,
    paddingVertical: 8,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
