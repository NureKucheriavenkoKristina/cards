import { supabase } from "@/src/lib/supabase";
import {
  getNextSrsDayBoundary,
  normalizeSrsDayStartHour,
  SRS_DAY_START_HOUR_LOCAL,
} from "@/src/lib/srsDayBoundary";
import { scheduleCard, type Rating, type StudySettings } from "./spacedRepetition";

export interface UserCardProgress {
  user_id: string;
  card_id: string;
  status: string;
  due_date: string | null;
  interval_days: number | null;
  ease_factor: number | null;
  repetitions: number | null;
  last_reviewed_at: string | null;
  learning_step_index?: number | null;
}

/**
 * Fetch user's progress for cards in a deck
 */
export async function fetchUserProgressForDeck(
  userId: string,
  cardIds: string[]
): Promise<Map<string, UserCardProgress>> {
  if (cardIds.length === 0) return new Map();
  const { data } = await supabase
    .from("user_card_progress")
    .select("*")
    .eq("user_id", userId)
    .in("card_id", cardIds);
  const map = new Map<string, UserCardProgress>();
  (data ?? []).forEach((r) => map.set(r.card_id, r as UserCardProgress));
  return map;
}

/**
 * Card is due if no progress or due_date <= now
 */
export function isCardDueForUser(
  progress: UserCardProgress | undefined,
  now: Date = new Date()
): boolean {
  if (!progress) return true;
  if (progress.due_date == null) return true;
  return new Date(progress.due_date) <= now;
}

/**
 * Count cards due in the current SRS day (day rolls at `srsDayStartHour` local).
 * Includes no progress, null due, and any due_date on or before the next boundary.
 */
export function getDueTodayCountForUser(
  cardIds: string[],
  progressMap: Map<string, UserCardProgress>,
  now: Date = new Date(),
  srsDayStartHour: number = SRS_DAY_START_HOUR_LOCAL
): number {
  const hour = normalizeSrsDayStartHour(srsDayStartHour);
  const endOfSrsDay = getNextSrsDayBoundary(now, hour);
  return cardIds.filter((cardId) => {
    const p = progressMap.get(cardId);
    if (!p) return true;
    if (p.due_date == null) return true;
    return new Date(p.due_date) <= endOfSrsDay;
  }).length;
}

/**
 * Save progress after user rates a card (UPSERT into user_card_progress)
 */
export async function saveProgressAfterRating(
  userId: string,
  cardId: string,
  rating: Rating,
  currentProgress: UserCardProgress | undefined,
  settings?: StudySettings
): Promise<{ error: unknown }> {
  const current = currentProgress
    ? {
        next_review_at: currentProgress.due_date,
        interval_days: currentProgress.interval_days ?? undefined,
        ease_factor: currentProgress.ease_factor ?? undefined,
        repetitions: currentProgress.repetitions ?? undefined,
      }
    : undefined;

  const scheduled = scheduleCard(current, rating, new Date(), settings);

  const row = {
    user_id: userId,
    card_id: cardId,
    status: rating === 1 ? "relearning" : "review",
    due_date: scheduled.next_review_at,
    interval_days: Math.max(0, Math.round(scheduled.interval_days)),
    ease_factor: scheduled.ease_factor,
    repetitions: scheduled.repetitions,
    last_reviewed_at: scheduled.last_reviewed_at,
  };

  const { error } = await supabase
    .from("user_card_progress")
    .upsert(row, { onConflict: "user_id,card_id" });

  return { error };
}
