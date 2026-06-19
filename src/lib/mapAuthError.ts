type AuthErrorLike = {
  message?: string;
  code?: string;
};

/**
 * Maps Supabase Auth API errors to localized UI strings.
 */
export function mapAuthErrorMessage(
  error: AuthErrorLike | null | undefined,
  t: (key: string) => string
): string {
  if (!error) return t('authErrorGeneric');

  const code = (error.code ?? '').toLowerCase();
  const msg = (error.message ?? '').toLowerCase();

  const byCode: Record<string, string> = {
    invalid_credentials: 'authInvalidCredentials',
    email_not_confirmed: 'authEmailNotConfirmed',
    user_already_exists: 'authUserAlreadyExists',
    weak_password: 'authWeakPassword',
    over_email_send_rate_limit: 'authEmailRateLimit',
    over_request_rate_limit: 'authEmailRateLimit',
    signup_disabled: 'authSignupDisabled',
    validation_failed: 'authInvalidEmail',
  };

  if (code && byCode[code]) return t(byCode[code]);

  if (msg.includes('invalid login credentials')) return t('authInvalidCredentials');
  if (msg.includes('email not confirmed')) return t('authEmailNotConfirmed');
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return t('authUserAlreadyExists');
  }
  if (msg.includes('password') && (msg.includes('at least') || msg.includes('6'))) {
    return t('authWeakPassword');
  }
  if (msg.includes('invalid email') || msg.includes('unable to validate email') || (msg.includes('email') && msg.includes('invalid'))) {
    return t('authInvalidEmail');
  }
  if (msg.includes('rate limit') || msg.includes('too many')) return t('authEmailRateLimit');
  if (msg.includes('oauth cancelled') || msg.includes('user cancelled')) return t('authOAuthCancelled');
  if (
    msg.includes('oauth session missing') ||
    msg.includes('oauth failed') ||
    msg.includes('redirect uri invalid') ||
    msg.includes('redirect uri could not')
  ) {
    return t('authOAuthFailed');
  }
  if (msg.includes('redirect') || msg.includes('invalid_request')) return t('authOAuthRedirectHint');

  return error.message?.trim() || t('authErrorGeneric');
}
