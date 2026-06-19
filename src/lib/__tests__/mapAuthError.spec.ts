import { mapAuthErrorMessage } from '../mapAuthError';

describe('mapAuthErrorMessage', () => {
  const mockT = jest.fn((key: string) => `translated_${key}`);

  beforeEach(() => {
    mockT.mockClear();
  });

  it('returns generic error if error is null or undefined', () => {
    expect(mapAuthErrorMessage(null, mockT)).toBe('translated_authErrorGeneric');
    expect(mapAuthErrorMessage(undefined, mockT)).toBe('translated_authErrorGeneric');
  });

  describe('mapping by code', () => {
    it('maps invalid_credentials', () => {
      expect(mapAuthErrorMessage({ code: 'invalid_credentials' }, mockT)).toBe('translated_authInvalidCredentials');
    });

    it('maps email_not_confirmed', () => {
      expect(mapAuthErrorMessage({ code: 'email_not_confirmed' }, mockT)).toBe('translated_authEmailNotConfirmed');
    });

    it('maps user_already_exists', () => {
      expect(mapAuthErrorMessage({ code: 'user_already_exists' }, mockT)).toBe('translated_authUserAlreadyExists');
    });

    it('maps weak_password', () => {
      expect(mapAuthErrorMessage({ code: 'weak_password' }, mockT)).toBe('translated_authWeakPassword');
    });

    it('maps rate limits', () => {
      expect(mapAuthErrorMessage({ code: 'over_email_send_rate_limit' }, mockT)).toBe('translated_authEmailRateLimit');
      expect(mapAuthErrorMessage({ code: 'over_request_rate_limit' }, mockT)).toBe('translated_authEmailRateLimit');
    });
    
    it('maps signup disabled', () => {
      expect(mapAuthErrorMessage({ code: 'signup_disabled' }, mockT)).toBe('translated_authSignupDisabled');
    });
  });

  describe('mapping by message', () => {
    it('maps invalid login credentials', () => {
      expect(mapAuthErrorMessage({ message: 'Invalid Login Credentials' }, mockT)).toBe('translated_authInvalidCredentials');
    });

    it('maps email not confirmed', () => {
      expect(mapAuthErrorMessage({ message: 'User Email Not Confirmed' }, mockT)).toBe('translated_authEmailNotConfirmed');
    });

    it('maps user already registered', () => {
      expect(mapAuthErrorMessage({ message: 'User already registered' }, mockT)).toBe('translated_authUserAlreadyExists');
      expect(mapAuthErrorMessage({ message: 'Email has already been registered' }, mockT)).toBe('translated_authUserAlreadyExists');
    });

    it('maps weak password', () => {
      expect(mapAuthErrorMessage({ message: 'Password should be at least 6 characters' }, mockT)).toBe('translated_authWeakPassword');
    });

    it('maps invalid email', () => {
      expect(mapAuthErrorMessage({ message: 'Unable to validate email address' }, mockT)).toBe('translated_authInvalidEmail');
    });

    it('maps rate limit messages', () => {
      expect(mapAuthErrorMessage({ message: 'Too many requests' }, mockT)).toBe('translated_authEmailRateLimit');
    });

    it('maps oauth cancelled', () => {
      expect(mapAuthErrorMessage({ message: 'User cancelled the login flow' }, mockT)).toBe('translated_authOAuthCancelled');
    });

    it('maps oauth failed', () => {
      expect(mapAuthErrorMessage({ message: 'OAuth session missing' }, mockT)).toBe('translated_authOAuthFailed');
    });
    
    it('returns original message if no match found', () => {
      expect(mapAuthErrorMessage({ message: 'Something completely different' }, mockT)).toBe('Something completely different');
    });
    
    it('returns generic error if no message and no matching code', () => {
      expect(mapAuthErrorMessage({ code: 'unknown_code' }, mockT)).toBe('translated_authErrorGeneric');
    });
  });
});
