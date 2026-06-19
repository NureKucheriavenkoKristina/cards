import {
  DEFAULT_EASE_PERMILLE,
  type ReviewSchedulerConfig,
  defaultReviewSchedulerConfig,
} from "./reviewScheduler";

/**
 * App-wide spaced repetition settings (same for every deck).
 * Tune `learningStepsSeconds` / `relearningStepsSeconds` to match how you want first reviews to feel.
 */
export interface GlobalSpacedRepetitionSettings extends ReviewSchedulerConfig {
  /** Delays for new cards in seconds (e.g. 60, 600 = 1m then 10m). Must be non-empty. */
  learningStepsSeconds: number[];
  /** Short delays after a failed review, before the card returns to day-based intervals. Non-empty enables relearning. */
  relearningStepsSeconds: number[];
  /** First interval in days after the last learning step (before the card is fully “mature”). */
  graduatingIntervalDays: number;
  /** Pressing Easy while learning skips remaining steps and schedules this many days out. */
  easyIntervalDuringLearningDays: number;
  /** Pressing Hard during learning: wait this many seconds before showing the card again. */
  learningHardDelaySeconds: number;
  /** Same idea as `learningHardDelaySeconds` for the relearning queue. */
  relearningHardDelaySeconds: number;
}

export const defaultGlobalSpacedRepetitionSettings: GlobalSpacedRepetitionSettings = {
  ...defaultReviewSchedulerConfig,
  learningStepsSeconds: [60, 600],
  relearningStepsSeconds: [600],
  graduatingIntervalDays: 1,
  easyIntervalDuringLearningDays: 4,
  learningHardDelaySeconds: 60,
  relearningHardDelaySeconds: 600,
};

/** Snapshot persisted per card (maps cleanly to DB columns). */
export interface CardScheduleSnapshot {
  phase: "learning" | "review" | "relearning";
  /**
   * Learning: next Good applies `learningStepsSeconds[learningStepIndex]`; when `>= length`, Good graduates.
   * Relearning: first delay is already spent to show the card after a lapse; first Good uses `relearningStepsSeconds[1]`
   * when there are multiple steps and bumps the index to `2` (see `handleRelearning` in `cardScheduling.ts`).
   */
  learningStepIndex: number;
  easePermille: number;
  /** Last mature interval in days (used for review math and lapse). */
  intervalDays: number;
}

export function initialSnapshotForNewCard(
  settings: GlobalSpacedRepetitionSettings = defaultGlobalSpacedRepetitionSettings
): CardScheduleSnapshot {
  return {
    phase: "learning",
    learningStepIndex: 0,
    easePermille: DEFAULT_EASE_PERMILLE,
    intervalDays: 0,
  };
}

export function validateGlobalSettings(settings: GlobalSpacedRepetitionSettings): void {
  if (!settings.learningStepsSeconds.length) {
    throw new Error("learningStepsSeconds must contain at least one step");
  }
  if (settings.learningStepsSeconds.some((s) => s <= 0)) {
    throw new Error("learning step delays must be positive (seconds)");
  }
  if (settings.relearningStepsSeconds.some((s) => s <= 0)) {
    throw new Error("relearning step delays must be positive (seconds)");
  }
  if (settings.graduatingIntervalDays < 1) {
    throw new Error("graduatingIntervalDays must be at least 1");
  }
  if (settings.easyIntervalDuringLearningDays < 1) {
    throw new Error("easyIntervalDuringLearningDays must be at least 1");
  }
}
