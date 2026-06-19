/**
 * Review-phase scheduling (modified SM-2) for mature cards.
 *
 * Interval + ease updates follow common SM-2-family patterns; see also:
 * https://gist.github.com/fasiha/31ce46c36371ff57fdbc1254af424174
 */

export type ReviewRating = "again" | "hard" | "good" | "easy";

/** Default ease as permille: 2500 ≈ factor 2.5. */
export const DEFAULT_EASE_PERMILLE = 2500;
export const MIN_EASE_PERMILLE = 1300;

export interface ReviewSchedulerConfig {
  /** Interval modifier `m`. Scales all computed intervals. */
  intervalModifier: number;
  /** Easy bonus `m4` applied to the Easy interval. */
  easyBonus: number;
  /**
   * Multiplier applied to previous interval on lapse: `i1 = m0 * i`.
   * When 0, use `minLapseIntervalDays` so the card still gets a concrete day interval.
   */
  lapseIntervalMultiplier: number;
  /** Floor for ease (permille). */
  easeMinimum: number;
  /** When lapse formula yields 0, use at least this many days. */
  minLapseIntervalDays: number;
}

export const defaultReviewSchedulerConfig: ReviewSchedulerConfig = {
  intervalModifier: 1.0,
  easyBonus: 1.3,
  lapseIntervalMultiplier: 0,
  easeMinimum: MIN_EASE_PERMILLE,
  minLapseIntervalDays: 1,
};

/**
 * Computes Hard / Good / Easy interval candidates for one review
 * (Hard → Good ≥ Hard+1 → Easy ≥ Good+1).
 *
 * `delayDays` = days between scheduled due date and actual review (0 if on time or early).
 */
export function computeCandidateIntervalsDays(
  previousIntervalDays: number,
  delayDays: number,
  easePermille: number,
  config: ReviewSchedulerConfig = defaultReviewSchedulerConfig
): { hard: number; good: number; easy: number } {
  const i = Math.max(0, previousIntervalDays);
  const d = Math.max(0, delayDays);
  const f = easePermille;
  const m = config.intervalModifier;
  const m4 = config.easyBonus;

  const hard = Math.max(i + 1, (i + d / 4) * 1.2 * m);
  const good = Math.max(hard + 1, (i + d / 2) * (f / 1000) * m);
  const easy = Math.max(good + 1, (i + d) * (f / 1000) * m * m4);

  return {
    hard: Math.round(hard),
    good: Math.round(good),
    easy: Math.round(easy),
  };
}

/** Ease change for each review grade (permille). */
export function nextEasePermille(
  easePermille: number,
  rating: ReviewRating,
  config: ReviewSchedulerConfig = defaultReviewSchedulerConfig
): number {
  const floor = config.easeMinimum;
  switch (rating) {
    case "again":
      return Math.max(floor, easePermille - 200);
    case "hard":
      return Math.max(floor, easePermille - 150);
    case "good":
      return easePermille;
    case "easy":
      return Math.max(floor, easePermille + 150);
    default: {
      const _exhaustive: never = rating;
      return _exhaustive;
    }
  }
}

export function lapseIntervalDays(
  previousIntervalDays: number,
  config: ReviewSchedulerConfig = defaultReviewSchedulerConfig
): number {
  const i = Math.max(0, previousIntervalDays);
  const raw = config.lapseIntervalMultiplier * i;
  if (raw <= 0) {
    return config.minLapseIntervalDays;
  }
  return Math.max(config.minLapseIntervalDays, Math.round(raw));
}

export interface ReviewSchedulingInput {
  previousIntervalDays: number;
  /** Days after due date (0 if reviewed on or before due). */
  delayDays: number;
  easePermille: number;
  rating: ReviewRating;
}

export interface ReviewSchedulingResult {
  easePermille: number;
  intervalDays: number;
}

/**
 * Single step: given current scheduling state and a grade, returns new ease and interval (days).
 * Use this after a card is in the **review** state with a meaningful `previousIntervalDays`.
 */
export function scheduleNextReview(
  input: ReviewSchedulingInput,
  config: ReviewSchedulerConfig = defaultReviewSchedulerConfig
): ReviewSchedulingResult {
  const { previousIntervalDays, delayDays, easePermille, rating } = input;
  const ease = nextEasePermille(easePermille, rating, config);

  if (rating === "again") {
    return {
      easePermille: ease,
      intervalDays: lapseIntervalDays(previousIntervalDays, config),
    };
  }

  const { hard, good, easy } = computeCandidateIntervalsDays(
    previousIntervalDays,
    delayDays,
    easePermille,
    config
  );

  switch (rating) {
    case "hard":
      return { easePermille: ease, intervalDays: hard };
    case "good":
      return { easePermille: ease, intervalDays: good };
    case "easy":
      return { easePermille: ease, intervalDays: easy };
  }
}
