import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { AuthTopActions } from '@/src/components/AuthTopActions';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { authFormStyles, authInputStyle } from '@/src/components/authFormStyles';
import { mapAuthErrorMessage } from '@/src/lib/mapAuthError';
import { keyboardAvoidingBehavior } from '@/src/lib/keyboardAvoiding';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail =
    typeof params.email === 'string' ? decodeURIComponent(params.email) : '';

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const { resetPassword } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const C = useAppColors();

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const handleResetEmail = async () => {
    if (!email.trim()) {
      setError(t('emailRequired'));
      return;
    }

    setLoading(true);
    setError('');

    const { error: resetError } = await resetPassword(email.trim());

    if (resetError) {
      const message = mapAuthErrorMessage(resetError, t);
      setError(message || t('unexpectedError'));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={[{ color: C.tint, fontSize: 16, fontWeight: '600' }]}>← {t('goBack')}</Text>
          </TouchableOpacity>

          <View style={authFormStyles.header}>
            <Text style={[authFormStyles.title, { color: C.text }]}>{t('forgotPasswordTitle')}</Text>
            <Text style={[authFormStyles.subtitle, { color: C.textSub, marginTop: 8 }]}>
              {sent ? t('resetPasswordEmailSent') : t('resetPasswordDescription')}
            </Text>
          </View>

          {!sent ? (
            <View style={styles.form}>
              <TextInput
                style={authInputStyle(C)}
                placeholder={t('email')}
                placeholderTextColor={C.placeholder}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />

              <View style={styles.errorHolder}>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>

              <TouchableOpacity
                style={[authFormStyles.button, styles.button, { backgroundColor: C.tint }, loading && styles.buttonDisabled]}
                onPress={handleResetEmail}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{t('sendResetEmail')}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => router.replace('/auth/login' as never)}
                disabled={loading}
              >
                <Text style={[styles.backLinkText, { color: C.tint }]}>{t('backToSignIn')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.form, styles.successContainer]}>
              <Text style={[styles.successText, { color: C.text }]}>
                ✓ {t('resetEmailSent').replace('{email}', email.trim())}
              </Text>
              <Text style={[styles.successSubtext, { color: C.textSub }]}>
                {t('resetEmailSentHint')}
              </Text>
              <TouchableOpacity
                style={[authFormStyles.button, styles.button, { backgroundColor: C.tint }]}
                onPress={() => router.replace('/auth/login' as never)}
              >
                <Text style={styles.buttonText}>{t('backToSignIn')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  backButton: {
    paddingVertical: 12,
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
  backLink: {
    marginTop: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 8,
  },
});
