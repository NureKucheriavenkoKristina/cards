import React from 'react';
import { render, act } from '@testing-library/react';

const mockUseAuth = jest.fn();
const mockUseWebStudyReminder = jest.fn();

jest.mock('@/src/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/src/hooks/useWebStudyReminder', () => ({
  useWebStudyReminder: () => mockUseWebStudyReminder(),
}));

const { WebStudyReminderProvider, useWebStudyReminderState } = require('../WebStudyReminderContext');

describe('WebStudyReminderContext', () => {
  it('throws when used outside provider', () => {
    function Consumer() {
      useWebStudyReminderState();
      return null;
    }

    expect(() => {
      render(React.createElement(Consumer, null));
    }).toThrow('useWebStudyReminderState must be used within WebStudyReminderProvider');
  });

  it('provides the hook value to descendants', async () => {
    const fakeState = {
      dailyDue: false,
      dailyReminderId: 'study-daily-user1',
      queuedReminders: [],
      dismissDailyForToday: jest.fn(),
      dismissBellItem: jest.fn(),
      prefs: { enabled: true, hour: 18 },
      refresh: jest.fn(),
    };
    mockUseAuth.mockReturnValue({ user: { id: 'user1' } });
    mockUseWebStudyReminder.mockReturnValue(fakeState);

    function Consumer() {
      const state = useWebStudyReminderState();
      return React.createElement(React.Fragment, null, state.dailyReminderId);
    }

    let container: HTMLElement | null = null;
    await act(async () => {
      const result = render(
        React.createElement(WebStudyReminderProvider, null,
          React.createElement(Consumer, null),
        ),
      );
      container = result.container;
    });

    expect(container?.textContent).toBe('study-daily-user1');
  });
});