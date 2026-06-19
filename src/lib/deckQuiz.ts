import type { Card } from "@/assets/data/cards";
import {
  CLOZE_GAP_MARKER,
  getClozePartsFromCard,
  isClozeGapComplete,
  normalizeCardType,
} from "@/src/lib/cardModel";
import { putDeckQuizSession } from "@/src/lib/deckQuizSession";
import { supabase } from "@/src/lib/supabase";

export type DeckQuizSource = "manual" | "preset_10" | "preset_20" | "preset_30";

export type QuizQuestion = {
  cardId: string;
  prompt: string;
  correctAnswer: string;
  options: string[];
  kind: "basic" | "cloze";
};

export type DeckQuiz = {
  sessionId: string;
  deckId: string;
  title: string;
  source: DeckQuizSource;
  questions: QuizQuestion[];
};

export const QUIZ_MIN_CARDS = 4;

export const QUIZ_PRESET_COUNTS: Record<Exclude<DeckQuizSource, "manual">, number> = {
  preset_10: 10,
  preset_20: 20,
  preset_30: 30,
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function getQuizAnswer(card: Card): string | null {
  const ctype = normalizeCardType(card.card_type);
  if (ctype === "cloze") {
    const parts = getClozePartsFromCard(card);
    const hidden = parts?.hidden?.trim();
    return hidden || null;
  }
  const back = card.back_text?.trim();
  return back || null;
}

export function getQuizPrompt(card: Card): string | null {
  const ctype = normalizeCardType(card.card_type);
  if (ctype === "cloze") {
    const parts = getClozePartsFromCard(card);
    if (parts && isClozeGapComplete(parts)) {
      return `${parts.before}${CLOZE_GAP_MARKER}${parts.after}`.trim();
    }
    const front = card.front_text?.trim();
    return front || null;
  }
  const front = card.front_text?.trim();
  return front || null;
}

export function cardHasQuizSides(card: Card): boolean {
  return Boolean(getQuizPrompt(card) && getQuizAnswer(card));
}

export function generateQuizQuestions(cards: Card[]): QuizQuestion[] {
  const pool = cards.filter(cardHasQuizSides);
  const questions: QuizQuestion[] = [];

  for (const card of pool) {
    const prompt = getQuizPrompt(card);
    const correct = getQuizAnswer(card);
    if (!prompt || !correct) continue;

    const wrongPool = uniqueStrings(
      pool
        .filter((c) => c.card_id !== card.card_id)
        .map((c) => getQuizAnswer(c))
        .filter((a): a is string => Boolean(a))
        .filter((a) => a.trim().toLowerCase() !== correct.trim().toLowerCase()),
    );

    const optionCount = Math.min(4, 1 + wrongPool.length);
    const wrongCount = optionCount - 1;
    const wrongs = shuffle(wrongPool).slice(0, wrongCount);
    const options = shuffle([correct, ...wrongs]);

    questions.push({
      cardId: card.card_id,
      prompt,
      correctAnswer: correct,
      options,
      kind: normalizeCardType(card.card_type) === "cloze" ? "cloze" : "basic",
    });
  }

  return shuffle(questions);
}

export async function fetchDeckCardsForQuiz(deckId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("*, card_media(*)")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Card[];
}

export async function fetchDifficultCardIds(
  deckId: string,
  userId: string,
  limit: number,
): Promise<string[]> {
  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("card_id")
    .eq("deck_id", deckId);

  if (cardsError) throw cardsError;
  const allIds = (cards ?? []).map((c) => c.card_id as string);
  if (allIds.length === 0) return [];

  const { data: logs, error: logsError } = await supabase
    .from("review_logs")
    .select("card_id, rating, reviewed_at")
    .eq("user_id", userId)
    .eq("deck_id", deckId)
    .in("card_id", allIds)
    .order("reviewed_at", { ascending: false });

  if (logsError) throw logsError;

  const latestRating = new Map<string, number>();
  for (const row of logs ?? []) {
    if (!latestRating.has(row.card_id)) {
      latestRating.set(row.card_id, row.rating as number);
    }
  }

  const hardIds = allIds.filter((id) => {
    const rating = latestRating.get(id);
    return rating === 0 || rating === 1;
  });

  let picked = shuffle(hardIds).slice(0, limit);

  if (picked.length < limit) {
    const { data: progress } = await supabase
      .from("user_card_progress")
      .select("card_id, status")
      .eq("user_id", userId)
      .in("card_id", allIds)
      .in("status", ["learning", "relearning"]);

    const learningIds = shuffle(
      (progress ?? []).map((p) => p.card_id as string).filter((id) => !picked.includes(id)),
    );
    picked = [...picked, ...learningIds].slice(0, limit);
  }

  if (picked.length < limit) {
    const rest = shuffle(allIds.filter((id) => !picked.includes(id)));
    picked = [...picked, ...rest].slice(0, limit);
  }

  return picked;
}

export function pickCardsByIds(cards: Card[], cardIds: string[]): Card[] {
  const map = new Map(cards.map((c) => [c.card_id, c]));
  return cardIds.map((id) => map.get(id)).filter((c): c is Card => Boolean(c));
}

export function buildQuizTitle(
  source: DeckQuizSource,
  questionCount: number,
  t: (key: string) => string,
): string {
  if (source === "manual") {
    return t("deckQuizTitleManual").replace("{n}", String(questionCount));
  }
  const n = QUIZ_PRESET_COUNTS[source];
  return t("deckQuizTitlePreset").replace("{n}", String(n));
}

export async function createDeckQuizFromSelection(params: {
  deckId: string;
  userId: string;
  source: DeckQuizSource;
  selectedCardIds: string[];
  allCards: Card[];
  t: (key: string) => string;
}): Promise<{ ok: true; quiz: DeckQuiz } | { ok: false; errorKey: string }> {
  let cardIds = params.selectedCardIds;

  if (params.source !== "manual") {
    const limit = QUIZ_PRESET_COUNTS[params.source];
    cardIds = await fetchDifficultCardIds(params.deckId, params.userId, limit);
  }

  const cards = pickCardsByIds(params.allCards, cardIds).filter(cardHasQuizSides);
  if (cards.length < QUIZ_MIN_CARDS) {
    return { ok: false, errorKey: "deckQuizNeedMinCards" };
  }

  const questions = generateQuizQuestions(cards);
  if (questions.length < 1) {
    return { ok: false, errorKey: "deckQuizNoQuestions" };
  }

  const title = buildQuizTitle(params.source, questions.length, params.t);
  const stored = putDeckQuizSession({
    deckId: params.deckId,
    title,
    source: params.source,
    questions,
  });

  return {
    ok: true,
    quiz: {
      sessionId: stored.sessionId,
      deckId: stored.deckId,
      title: stored.title,
      source: stored.source,
      questions: stored.questions,
    },
  };
}
