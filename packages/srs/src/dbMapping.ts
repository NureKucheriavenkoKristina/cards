import {
  DEFAULT_EASE_PERMILLE,
  type ReviewRating,
} from "./reviewScheduler";
import { scheduleAfterAnswer, type ScheduleOutcome } from "./cardScheduling";
import type {
  AppSpacedRepetitionSettingsRow,
  DbProgressStatus,
  UserCardProgressRow,
} from "./dbTypes";
import type {
  CardScheduleSnapshot,
  GlobalSpacedRepetitionSettings,
} from "./globalSettings";

export const EASE_PERMILLE_FACTOR = 1000;

export function easeFactorToPermille(easeFactor: number): number {
  return Math.round(easeFactor * EASE_PERMILLE_FACTOR);
}

export function permilleToEaseFactor(permille: number): number {
  return permille / EASE_PERMILLE_FACTOR;
}

/** Maps DB `status` + row fields → scheduler snapshot. `new` is treated as start of learning. */
export function progressRowToSnapshot(
  row: UserCardProgressRow,
): CardScheduleSnapshot {
  const ease =
    row.ease_factor != null && Number.isFinite(row.ease_factor)
      ? easeFactorToPermille(row.ease_factor)
      : DEFAULT_EASE_PERMILLE;

  const intervalDays =
    row.interval_days != null && Number.isFinite(row.interval_days)
      ? Math.max(0, Math.floor(row.interval_days))
      : 0;

  const step = row.learning_step_index ?? 0;

  switch (row.status) {
    case "new":
      return {
        phase: "learning",
        learningStepIndex: 0,
        easePermille: ease,
        intervalDays: 0,
      };
    case "learning":
      return {
        phase: "learning",
        learningStepIndex: step,
        easePermille: ease,
        intervalDays: intervalDays,
      };
    case "relearning":
      return {
        phase: "relearning",
        learningStepIndex: step,
        easePermille: ease,
        intervalDays: intervalDays,
      };
    case "review":
      return {
        phase: "review",
        learningStepIndex: step,
        easePermille: ease,
        intervalDays: Math.max(1, intervalDays),
      };
    default: {
      const _n: never = row.status;
      return _n;
    }
  }
}

/** Maps scheduler phase → DB `status` (not `new`). */
export function phaseToDbStatus(
  phase: CardScheduleSnapshot["phase"],
): DbProgressStatus {
  switch (phase) {
    case "learning":
      return "learning";
    case "relearning":
      return "relearning";
    case "review":
      return "review";
    default: {
      const _e: never = phase;
      return _e;
    }
  }
}

export function snapshotToDbStatus(
  snapshot: CardScheduleSnapshot,
): DbProgressStatus {
  return phaseToDbStatus(snapshot.phase);
}

export interface ProgressUpdatePatch {
  status: DbProgressStatus;
  due_date: string;
  interval_days: number;
  ease_factor: number;
  learning_step_index: number;
  last_reviewed_at: string;
}

/**
 * Builds DB update fields from scheduler outcome. `reviewedAt` should be server time (UTC ISO).
 * Due date: short steps use exact delay; day intervals use `intervalDays` × 24h from `reviewedAt` (MVP).
 */
export function scheduleOutcomeToProgressPatch(
  outcome: ScheduleOutcome,
  reviewedAt: Date,
): ProgressUpdatePatch {
  const due = nextDueDateFromOutcome(outcome, reviewedAt);
  return {
    status: phaseToDbStatus(outcome.phase),
    due_date: due.toISOString(),
    interval_days: Math.max(0, outcome.intervalDays),
    ease_factor: permilleToEaseFactor(outcome.easePermille),
    learning_step_index: outcome.learningStepIndex,
    last_reviewed_at: reviewedAt.toISOString(),
  };
}

/** Same math as Edge Function `submit-card-review` — for optimistic UI before the network returns. */
export function applyRatingToProgressRow(
  row: UserCardProgressRow,
  rating: ReviewRating,
  settings: AppSpacedRepetitionSettingsRow,
  reviewedAt: Date = new Date()
): { progress: UserCardProgressRow; outcome: ScheduleOutcome } {
  const global = appSettingsRowToGlobal(settings);
  const snapshot = progressRowToSnapshot(row);
  const delayDays = delayDaysForReview(row.due_date, reviewedAt);
  const outcome = scheduleAfterAnswer(snapshot, rating, delayDays, global);
  const patch = scheduleOutcomeToProgressPatch(outcome, reviewedAt);
  const repetitions = nextRepetitionsCount(row.repetitions, rating);
  return {
    progress: {
      ...row,
      status: patch.status,
      due_date: patch.due_date,
      interval_days: patch.interval_days,
      ease_factor: patch.ease_factor,
      learning_step_index: patch.learning_step_index,
      last_reviewed_at: patch.last_reviewed_at,
      repetitions,
    },
    outcome,
  };
}

export function nextDueDateFromOutcome(
  outcome: ScheduleOutcome,
  reviewedAt: Date,
): Date {
  if (outcome.dueInSecondsFromNow != null) {
    return new Date(reviewedAt.getTime() + outcome.dueInSecondsFromNow * 1000);
  }
  return new Date(reviewedAt.getTime() + outcome.intervalDays * 86_400_000);
}

/**
 * Days after due. `due` / `now` ISO strings from DB and `Date.now()`.
 */
export function delayDaysForReview(
  dueIso: string | null | undefined,
  now: Date,
): number {
  if (!dueIso) return 0;
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return 0;
  const ms = now.getTime() - due.getTime();
  return Math.max(0, ms / 86_400_000);
}

/** Maps global settings row → `GlobalSpacedRepetitionSettings` for `scheduleAfterAnswer`. */
export function appSettingsRowToGlobal(
  row: AppSpacedRepetitionSettingsRow,
): GlobalSpacedRepetitionSettings {
  return {
    intervalModifier: row.interval_modifier,
    easyBonus: row.easy_bonus,
    lapseIntervalMultiplier: row.lapse_interval_multiplier,
    easeMinimum: row.ease_minimum_permille,
    minLapseIntervalDays: row.min_lapse_interval_days,
    learningStepsSeconds: [...row.learning_steps_seconds],
    relearningStepsSeconds: [...row.relearning_steps_seconds],
    graduatingIntervalDays: row.graduating_interval_days,
    easyIntervalDuringLearningDays: row.easy_interval_during_learning_days,
    learningHardDelaySeconds: row.learning_hard_delay_seconds,
    relearningHardDelaySeconds: row.relearning_hard_delay_seconds,
  };
}

/** Optional counter for `repetitions`: increment on success, not on Again. */
export function nextRepetitionsCount(
  previous: number | null | undefined,
  rating: ReviewRating,
): number {
  const base = previous ?? 0;
  if (rating === "again") return base;
  return base + 1;
}

/** Fields for the initial `INSERT` into `user_card_progress` (before first answer). */
export interface InitialUserCardProgressInsert {
  user_id: string;
  card_id: string;
  status: DbProgressStatus;
  due_date: null;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  learning_step_index: number;
  last_reviewed_at: null;
}

export function initialUserCardProgressPayload(
  userId: string,
  cardId: string,
): InitialUserCardProgressInsert {
  return {
    user_id: userId,
    card_id: cardId,
    status: "new",
    due_date: null,
    interval_days: 0,
    ease_factor: 2.5,
    repetitions: 0,
    learning_step_index: 0,
    last_reviewed_at: null,
  };
}
