-- SRS: expand user_card_progress + add global settings table.

-- 1) Status: allow relearning
ALTER TABLE public.user_card_progress
  DROP CONSTRAINT IF EXISTS user_card_progress_status_check; -- drop old status check if exists

ALTER TABLE public.user_card_progress
  ADD CONSTRAINT user_card_progress_status_check -- add updated status check for card progress
  CHECK (status = ANY (ARRAY[
    'new'::text,        -- initial status
    'learning'::text,   -- currently learning
    'review'::text,     -- in review
    'relearning'::text  -- relearning after lapse
  ]));

-- 2) Learning / relearning step index (matches CardScheduleSnapshot.learningStepIndex)
ALTER TABLE public.user_card_progress
  ADD COLUMN IF NOT EXISTS learning_step_index integer NOT NULL DEFAULT 0; -- learning/relearning step index

-- 3) Global SRS parameters (single row, id = 1)
CREATE TABLE IF NOT EXISTS public.app_spaced_repetition_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single row with id=1
  learning_steps_seconds integer[] NOT NULL DEFAULT ARRAY[60, 600],      -- learning intervals
  relearning_steps_seconds integer[] NOT NULL DEFAULT ARRAY[600],       -- relearning intervals
  graduating_interval_days integer NOT NULL DEFAULT 1,                 -- interval after graduation
  easy_interval_during_learning_days integer NOT NULL DEFAULT 4,       -- easy interval during learning
  learning_hard_delay_seconds integer NOT NULL DEFAULT 60,             -- hard delay during learning
  relearning_hard_delay_seconds integer NOT NULL DEFAULT 600,         -- hard delay during relearning
  interval_modifier double precision NOT NULL DEFAULT 1.0,             -- interval multiplier
  easy_bonus double precision NOT NULL DEFAULT 1.3,                    -- easy answer bonus
  lapse_interval_multiplier double precision NOT NULL DEFAULT 0,       -- lapse multiplier
  ease_minimum_permille integer NOT NULL DEFAULT 1300,                -- minimum easiness (1300‰ = 1.3)
  min_lapse_interval_days integer NOT NULL DEFAULT 1,                 -- minimum days after lapse
  updated_at timestamp with time zone NOT NULL DEFAULT now()          -- last update timestamp
);

INSERT INTO public.app_spaced_repetition_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING; -- skip if row already exists

COMMENT ON TABLE public.app_spaced_repetition_settings IS 'Global SRS tuning; maps to GlobalSpacedRepetitionSettings in app code.'; -- table comment
