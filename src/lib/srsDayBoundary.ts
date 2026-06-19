/**
 * When the study "day" starts (local clock). Default 03:00 — the SRS calendar day
 * runs from this hour until the same hour next calendar day.
 */

/** Default SRS “day starts at” hour if user has not set a preference. */
export const SRS_DAY_START_HOUR_LOCAL = 3;

/** Clamp to 0–23 (local hour when the SRS calendar day rolls over). */
export function normalizeSrsDayStartHour(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return SRS_DAY_START_HOUR_LOCAL;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

/** Start of the current SRS day (local time). */
export function getSrsDayStart(now: Date = new Date(), startHour = SRS_DAY_START_HOUR_LOCAL): Date {
  const todayAt = new Date(now);
  todayAt.setHours(startHour, 0, 0, 0);
  if (now.getTime() < todayAt.getTime()) {
    const prev = new Date(todayAt);
    prev.setDate(prev.getDate() - 1);
    return prev;
  }
  return todayAt;
}

/**
 * End of the current SRS window (exclusive): next rollover at `startHour`.
 * Use for "due before end of today's SRS day" (daily cutoff).
 */
export function getNextSrsDayBoundary(now: Date = new Date(), startHour = SRS_DAY_START_HOUR_LOCAL): Date {
  const todayAt = new Date(now);
  todayAt.setHours(startHour, 0, 0, 0);
  if (now.getTime() < todayAt.getTime()) {
    return todayAt;
  }
  const next = new Date(todayAt);
  next.setDate(next.getDate() + 1);
  return next;
}
