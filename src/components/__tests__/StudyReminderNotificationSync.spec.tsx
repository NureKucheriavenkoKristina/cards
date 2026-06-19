import React from "react";
import { render, act } from "@testing-library/react";
import { jest } from "@jest/globals";

const mockParseStudyReminderPrefs = jest.fn();
const mockSyncStudyDailyReminder = jest.fn<(...args: any[]) => Promise<{ ok: true } | { ok: false; reason: string }>>();
const mockUseAuth = jest.fn();
const mockUseLanguage = jest.fn();
const mockRemove = jest.fn();
let capturedAppStateListener: ((nextState: string) => void) | null = null;

jest.mock("@/src/lib/webStudyReminder", () => ({
  parseStudyReminderPrefs: (...args: any[]) =>
    mockParseStudyReminderPrefs(...args),
}));

jest.mock("@/src/lib/studyReminderNotifications", () => ({
  syncStudyDailyReminder: (...args: any[]) =>
    mockSyncStudyDailyReminder(...args as Parameters<typeof mockSyncStudyDailyReminder>),
}));

jest.mock("@/src/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/src/contexts/LanguageContext", () => ({
  useLanguage: () => mockUseLanguage(),
}));

jest.mock("react-native", () => ({
  AppState: {
    currentState: "background",
    addEventListener: jest.fn(
      (event: string, callback: (nextState: string) => void) => {
        capturedAppStateListener = callback;
        return { remove: mockRemove };
      },
    ),
  },
}));

const {
  StudyReminderNotificationSync,
  runSync,
} = require("../StudyReminderNotificationSync");

describe("StudyReminderNotificationSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedAppStateListener = null;
    mockParseStudyReminderPrefs.mockReturnValue({ enabled: true, hour: 8 });
    mockSyncStudyDailyReminder.mockResolvedValue({ ok: true } as const);
  });

  it("calls syncStudyDailyReminder with disabled fallback when no user is present", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockUseLanguage.mockReturnValue({ locale: "en", t: (key: string) => key });

    await act(async () => {
      render(React.createElement(StudyReminderNotificationSync, null));
    });

    expect(mockSyncStudyDailyReminder).toHaveBeenCalledWith({
      enabled: false,
      hour: 9,
      title: "",
      body: "",
    });
  });

  it("calls syncStudyDailyReminder on mount and when AppState returns to active", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        user_metadata: {
          notifications: { studyReminder: "true", studyReminderHour: 15 },
        },
        id: "u1",
      },
    });
    mockUseLanguage.mockReturnValue({
      locale: "en",
      t: (key: string) => `translated:${key}`,
    });
    mockParseStudyReminderPrefs.mockReturnValue({ enabled: true, hour: 15 });

    await act(async () => {
      render(React.createElement(StudyReminderNotificationSync, null));
    });

    expect(mockSyncStudyDailyReminder).toHaveBeenCalledTimes(1);
    expect(mockSyncStudyDailyReminder).toHaveBeenCalledWith({
      enabled: true,
      hour: 15,
      title: "translated:pushRepeatWordsTitle",
      body: "translated:pushRepeatWordsBody",
    });

    expect(capturedAppStateListener).toBeTruthy();
    if (capturedAppStateListener) {
      act(() => capturedAppStateListener?.("active"));
    }

    expect(mockSyncStudyDailyReminder).toHaveBeenCalledTimes(2);
  });

  it("removes AppState listener on unmount", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockUseLanguage.mockReturnValue({ locale: "en", t: (key: string) => key });

    let unmountFn: (() => void) | null = null;
    await act(async () => {
      const { unmount } = render(
        React.createElement(StudyReminderNotificationSync, null),
      );
      unmountFn = unmount;
    });
    await act(async () => {
      unmountFn?.();
    });

    expect(mockRemove).toHaveBeenCalled();
  });

  it("runSync forwards metadata parsing and notification sync", () => {
    mockParseStudyReminderPrefs.mockReturnValue({ enabled: true, hour: 20 });
    runSync(
      { notifications: { studyReminder: true, studyReminderHour: 20 } },
      (key: string) => `x:${key}`,
    );
    expect(mockParseStudyReminderPrefs).toHaveBeenCalledWith({
      notifications: { studyReminder: true, studyReminderHour: 20 },
    });
    expect(mockSyncStudyDailyReminder).toHaveBeenCalledWith({
      enabled: true,
      hour: 20,
      title: "x:pushRepeatWordsTitle",
      body: "x:pushRepeatWordsBody",
    });
  });
});
