import { createContext, useContext, type ReactNode } from 'react';

import { useAuth } from '@/src/contexts/AuthContext';
import { useWebStudyReminder } from '@/src/hooks/useWebStudyReminder';

type WebStudyReminderState = ReturnType<typeof useWebStudyReminder>;

const WebStudyReminderContext = createContext<WebStudyReminderState | null>(null);

/** Single shared web reminder clock/state for bell badge + dismiss. */
export function WebStudyReminderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useWebStudyReminder(user);
  return (
    <WebStudyReminderContext.Provider value={value}>{children}</WebStudyReminderContext.Provider>
  );
}

export function useWebStudyReminderState(): WebStudyReminderState {
  const ctx = useContext(WebStudyReminderContext);
  if (!ctx) {
    throw new Error('useWebStudyReminderState must be used within WebStudyReminderProvider');
  }
  return ctx;
}
