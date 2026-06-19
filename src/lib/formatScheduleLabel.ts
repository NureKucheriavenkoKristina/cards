import type { ScheduleOutcome } from "@cardly/srs/cardScheduling";

/** Short label for rating buttons (interval hints). */
export function formatScheduleLabel(outcome: ScheduleOutcome): string {
  if (outcome.dueInSecondsFromNow != null) {
    const s = outcome.dueInSecondsFromNow;
    if (s < 60) return "<1m";
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
    if (s < 86_400) return `${Math.max(1, Math.round(s / 3600))}h`;
    return `${(s / 86_400).toFixed(1)}d`;
  }
  const d = outcome.intervalDays;
  if (d <= 0) return "0d";
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(1)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
