import type { DeckQuizSource, QuizQuestion } from "@/src/lib/deckQuiz";

export type DeckQuizSession = {
  sessionId: string;
  deckId: string;
  title: string;
  source: DeckQuizSource;
  questions: QuizQuestion[];
};

const sessions = new Map<string, DeckQuizSession>();
const activeByDeck = new Map<string, string>();

function newSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function putDeckQuizSession(
  quiz: Omit<DeckQuizSession, "sessionId"> & { sessionId?: string },
): DeckQuizSession {
  const sessionId = quiz.sessionId ?? newSessionId();
  const prev = activeByDeck.get(quiz.deckId);
  if (prev && prev !== sessionId) {
    sessions.delete(prev);
  }
  const stored: DeckQuizSession = { ...quiz, sessionId };
  sessions.set(sessionId, stored);
  activeByDeck.set(quiz.deckId, sessionId);
  return stored;
}

export function getDeckQuizSession(sessionId: string): DeckQuizSession | null {
  return sessions.get(sessionId) ?? null;
}

export function clearDeckQuizSession(sessionId: string): void {
  const quiz = sessions.get(sessionId);
  if (quiz) {
    if (activeByDeck.get(quiz.deckId) === sessionId) {
      activeByDeck.delete(quiz.deckId);
    }
    sessions.delete(sessionId);
  }
}
