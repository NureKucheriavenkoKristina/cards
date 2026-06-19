/**
 * spaced repetition algorithm (SM-2 inspired)
 * Quality: Again=1, Hard=2, Good=3, Easy=4
 */

import {
  getNextSrsDayBoundary,
  normalizeSrsDayStartHour,
  SRS_DAY_START_HOUR_LOCAL,
} from "./srsDayBoundary";

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface CardSchedule {
  next_review_at: string | null;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  last_reviewed_at: string | null;
}

export interface StudySettings {
  /** Local hour 0–23 when the SRS “day” rolls over (next study day starts at). */
  srsDayStartHour: number;
  againIntervalMinutes: number;
  hardIntervalMinutes: number;
  goodIntervalDays: number;
  easyIntervalDays: number;
  hardMultiplier: number;
  goodMultiplier: number;
  easyMultiplier: number;
  minEase: number;
  defaultEase: number;
  easeDecrementAgain: number;
  easeDecrementHard: number;
  easeIncrementEasy: number;
  maxEase: number;
}

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  srsDayStartHour: 3,
  againIntervalMinutes: 1,
  hardIntervalMinutes: 5,
  goodIntervalDays: 1,
  easyIntervalDays: 4,
  hardMultiplier: 1.2,
  goodMultiplier: 2.5,
  easyMultiplier: 3.5,
  minEase: 1.3,
  defaultEase: 2.5,
  easeDecrementAgain: 0.2,
  easeDecrementHard: 0.15,
  easeIncrementEasy: 0.15,
  maxEase: 2.7,
};

const ONE_MIN_DAYS = 1 / (24 * 60); // ~0.00069

/**
 * Calculate new schedule after user rates a card
 */
export function scheduleCard(
  current: Partial<CardSchedule> | undefined,
  rating: Rating,
  now: Date = new Date(),
  settings: StudySettings = DEFAULT_STUDY_SETTINGS
): CardSchedule {
  const isoNow = now.toISOString();
  const prevInterval = current?.interval_days ?? 0;
  const prevEase = Math.max(settings.minEase, current?.ease_factor ?? settings.defaultEase);
  const prevRepetitions = current?.repetitions ?? 0;

  let nextInterval: number;
  let newEase = prevEase;
  let newRepetitions: number;

  if (rating === 1) {
    // Again: show in N minutes, reset progress
    nextInterval = (settings.againIntervalMinutes / (24 * 60));
    newEase = Math.max(settings.minEase, prevEase - settings.easeDecrementAgain);
    newRepetitions = 0;
  } else if (rating === 2) {
    // Hard: shorter interval
    if (prevRepetitions === 0) {
      nextInterval = settings.hardIntervalMinutes / (24 * 60);
    } else {
      nextInterval = Math.max(ONE_MIN_DAYS, prevInterval * settings.hardMultiplier);
    }
    newEase = Math.max(settings.minEase, prevEase - settings.easeDecrementHard);
    newRepetitions = prevRepetitions + 1;
  } else if (rating === 3) {
    // Good: normal interval
    if (prevRepetitions === 0) {
      nextInterval = settings.goodIntervalDays;
    } else {
      nextInterval = prevInterval * settings.goodMultiplier;
    }
    newEase = prevEase;
    newRepetitions = prevRepetitions + 1;
  } else {
    // Easy (4): bonus interval
    if (prevRepetitions === 0) {
      nextInterval = settings.easyIntervalDays;
    } else {
      nextInterval = prevInterval * settings.easyMultiplier;
    }
    newEase = Math.min(settings.maxEase, prevEase + settings.easeIncrementEasy);
    newRepetitions = prevRepetitions + 1;
  }

  const nextReview = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000);

  return {
    next_review_at: nextReview.toISOString(),
    interval_days: nextInterval,
    ease_factor: Math.round(newEase * 100) / 100,
    repetitions: newRepetitions,
    last_reviewed_at: isoNow,
  };
}

/**
 * Check if a card is due for review (never studied or next_review_at <= now)
 */
export function isCardDue(
  card: { next_review_at?: string | null },
  now: Date = new Date()
): boolean {
  if (!card.next_review_at) return true;
  return new Date(card.next_review_at) <= now;
}

/**
 * Get count of cards due today (including overdue)
 */
export function getDueTodayCount(
  cards: { next_review_at?: string | null }[],
  now: Date = new Date(),
  srsDayStartHour?: number
): number {
  const hour =
    srsDayStartHour !== undefined ? normalizeSrsDayStartHour(srsDayStartHour) : SRS_DAY_START_HOUR_LOCAL;
  const endOfSrsDay = getNextSrsDayBoundary(now, hour);
  return cards.filter((c) => !c.next_review_at || new Date(c.next_review_at) <= endOfSrsDay).length;
}
