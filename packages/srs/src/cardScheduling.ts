import {
  computeCandidateIntervalsDays,
  lapseIntervalDays,
  nextEasePermille,
  scheduleNextReview,
  type ReviewRating,
} from "./reviewScheduler";
import {
  type CardScheduleSnapshot,
  type GlobalSpacedRepetitionSettings,
  defaultGlobalSpacedRepetitionSettings,
  validateGlobalSettings,
} from "./globalSettings";

export interface ScheduleOutcome {
  phase: CardScheduleSnapshot["phase"];
  learningStepIndex: number;
  easePermille: number;
  /** Set when the card uses day-based scheduling (review, or just graduated). */
  intervalDays: number;
  /**
   * When non-null, next due is `now + seconds` (learning / relearning short delays).
   * When null, use `intervalDays` with your normal “due at start of day + n days” rule.
   */
  dueInSecondsFromNow: number | null;
}

function learningSteps(settings: GlobalSpacedRepetitionSettings): number[] {
  return settings.learningStepsSeconds;
}

function relearningSteps(settings: GlobalSpacedRepetitionSettings): number[] {
  return settings.relearningStepsSeconds;
}

/**
 * Relearning: the first delay in `steps` is already spent waiting for the card to become due,
 * so the first Good does not schedule `steps[0]` again.
 */
function handleRelearning(
  snapshot: CardScheduleSnapshot,
  rating: ReviewRating,
  steps: number[],
  hardDelaySeconds: number,
  graduate: (easePermille: number) => ScheduleOutcome,
  settings: GlobalSpacedRepetitionSettings
): ScheduleOutcome {
  const { learningStepIndex, easePermille } = snapshot;

  if (rating === "easy") {
    const ease = nextEasePermille(easePermille, "easy", settings);
    return graduate(ease);
  }

  if (rating === "again") {
    return {
      phase: "relearning",
      learningStepIndex: 0,
      easePermille,
      intervalDays: snapshot.intervalDays,
      dueInSecondsFromNow: steps[0] ?? hardDelaySeconds,
    };
  }

  if (rating === "hard") {
    return {
      phase: "relearning",
      learningStepIndex,
      easePermille,
      intervalDays: snapshot.intervalDays,
      dueInSecondsFromNow: hardDelaySeconds,
    };
  }

  // Good
  if (learningStepIndex >= steps.length) {
    return graduate(easePermille);
  }

  if (learningStepIndex === 0) {
    if (steps.length === 1) {
      return graduate(easePermille);
    }
    return {
      phase: "relearning",
      learningStepIndex: 2,
      easePermille,
      intervalDays: snapshot.intervalDays,
      dueInSecondsFromNow: steps[1],
    };
  }

  const delay = steps[learningStepIndex];
  const nextIndex = learningStepIndex + 1;

  return {
    phase: "relearning",
    learningStepIndex: nextIndex,
    easePermille,
    intervalDays: snapshot.intervalDays,
    dueInSecondsFromNow: delay,
  };
}

function handleLearningLike(
  snapshot: CardScheduleSnapshot,
  rating: ReviewRating,
  steps: number[],
  hardDelaySeconds: number,
  settings: GlobalSpacedRepetitionSettings,
  onGraduate: (easePermille: number) => ScheduleOutcome
): ScheduleOutcome {
  const { learningStepIndex, easePermille } = snapshot;

  if (rating === "easy") {
    const ease = nextEasePermille(easePermille, "easy", settings);
    return {
      phase: "review",
      learningStepIndex: steps.length,
      easePermille: ease,
      intervalDays: Math.max(
        settings.graduatingIntervalDays,
        settings.easyIntervalDuringLearningDays
      ),
      dueInSecondsFromNow: null,
    };
  }

  if (rating === "again") {
    return {
      phase: snapshot.phase,
      learningStepIndex: 0,
      easePermille,
      intervalDays: snapshot.intervalDays,
      dueInSecondsFromNow: steps[0] ?? hardDelaySeconds,
    };
  }

  if (rating === "hard") {
    return {
      phase: snapshot.phase,
      learningStepIndex,
      easePermille,
      intervalDays: snapshot.intervalDays,
      dueInSecondsFromNow: hardDelaySeconds,
    };
  }

  // Good — advance one learning delay; when all short delays are done, graduate.
  if (learningStepIndex >= steps.length) {
    return onGraduate(easePermille);
  }

  const delay = steps[learningStepIndex];
  const nextIndex = learningStepIndex + 1;

  return {
    phase: snapshot.phase,
    learningStepIndex: nextIndex,
    easePermille,
    intervalDays: snapshot.intervalDays,
    dueInSecondsFromNow: delay,
  };
}

/**
 * Full scheduler: learning → review, lapses → relearning → review.
 * Call after each answer with the current persisted snapshot and `delayDaysForReview` (0 if early/on time).
 */
export function scheduleAfterAnswer(
  snapshot: CardScheduleSnapshot,
  rating: ReviewRating,
  delayDaysForReview: number,
  settings: GlobalSpacedRepetitionSettings = defaultGlobalSpacedRepetitionSettings
): ScheduleOutcome {
  validateGlobalSettings(settings);

  if (snapshot.phase === "learning") {
    return handleLearningLike(
      snapshot,
      rating,
      learningSteps(settings),
      settings.learningHardDelaySeconds,
      settings,
      (ease) => ({
        phase: "review",
        learningStepIndex: learningSteps(settings).length,
        easePermille: ease,
        intervalDays: settings.graduatingIntervalDays,
        dueInSecondsFromNow: null,
      })
    );
  }

  if (snapshot.phase === "relearning") {
    const steps = relearningSteps(settings);
    const graduateFromRelearning = (easePermille: number): ScheduleOutcome => ({
      phase: "review",
      learningStepIndex: learningSteps(settings).length,
      easePermille,
      intervalDays: lapseIntervalDays(snapshot.intervalDays, settings),
      dueInSecondsFromNow: null,
    });

    if (!steps.length) {
      return graduateFromRelearning(snapshot.easePermille);
    }

    return handleRelearning(
      snapshot,
      rating,
      steps,
      settings.relearningHardDelaySeconds,
      graduateFromRelearning,
      settings
    );
  }

  // Review
  if (rating === "again") {
    const ease = nextEasePermille(snapshot.easePermille, "again", settings);
    const rel = relearningSteps(settings);
    if (rel.length) {
      return {
        phase: "relearning",
        learningStepIndex: 0,
        easePermille: ease,
        intervalDays: snapshot.intervalDays,
        dueInSecondsFromNow: rel[0],
      };
    }
    const lapsed = scheduleNextReview(
      {
        previousIntervalDays: snapshot.intervalDays,
        delayDays: delayDaysForReview,
        easePermille: snapshot.easePermille,
        rating: "again",
      },
      settings
    );
    return {
      phase: "review",
      learningStepIndex: learningSteps(settings).length,
      easePermille: lapsed.easePermille,
      intervalDays: lapsed.intervalDays,
      dueInSecondsFromNow: null,
    };
  }

  const { easePermille, intervalDays } = scheduleNextReview(
    {
      previousIntervalDays: snapshot.intervalDays,
      delayDays: delayDaysForReview,
      easePermille: snapshot.easePermille,
      rating,
    },
    settings
  );

  return {
    phase: "review",
    learningStepIndex: learningSteps(settings).length,
    easePermille,
    intervalDays,
    dueInSecondsFromNow: null,
  };
}

/**
 * Labels for the four buttons in the review UI (day-based intervals).
 */
export function previewReviewIntervals(
  snapshot: Pick<CardScheduleSnapshot, "intervalDays" | "easePermille">,
  delayDaysForReview: number,
  settings: GlobalSpacedRepetitionSettings = defaultGlobalSpacedRepetitionSettings
): ReturnType<typeof computeCandidateIntervalsDays> {
  return computeCandidateIntervalsDays(
    snapshot.intervalDays,
    delayDaysForReview,
    snapshot.easePermille,
    settings
  );
}
