/**
 * Shapes aligned with Supabase tables (snake_case).
 * Run `supabase/migrations/*_srs_extensions.sql` before relying on optional columns.
 */

/** Matches CHECK on user_card_progress.status after SRS migration. */
export type DbProgressStatus = "new" | "learning" | "review" | "relearning";

/** Row from `public.user_card_progress` (+ migration columns). */
export interface UserCardProgressRow {
  user_id: string;
  card_id: string;
  status: DbProgressStatus;
  due_date: string | null;
  interval_days: number | null;
  ease_factor: number | null;
  repetitions: number | null;
  last_reviewed_at: string | null;
  learning_step_index?: number | null;
}

/** Single-row global SRS settings table `public.app_spaced_repetition_settings`. */
export interface AppSpacedRepetitionSettingsRow {
  id: number;
  learning_steps_seconds: number[];
  relearning_steps_seconds: number[];
  graduating_interval_days: number;
  easy_interval_during_learning_days: number;
  learning_hard_delay_seconds: number;
  relearning_hard_delay_seconds: number;
  interval_modifier: number;
  easy_bonus: number;
  lapse_interval_multiplier: number;
  ease_minimum_permille: number;
  min_lapse_interval_days: number;
  updated_at: string;
}
