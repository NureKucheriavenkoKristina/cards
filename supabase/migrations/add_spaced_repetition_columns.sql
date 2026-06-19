-- Add spaced repetition columns to cards table (Anki/SM-2 style)
-- Run this in Supabase SQL Editor to enable the learning algorithm

-- next_review_at: when the card is due (null = never studied, treat as due)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS next_review_at timestamptz;

-- interval_days: current interval in days (1 = 1 day, 0.0007 ≈ 1 min)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS interval_days numeric DEFAULT 0;

-- ease_factor: SM-2 ease factor (default 2.5, min 1.3)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ease_factor numeric DEFAULT 2.5;

-- repetitions: consecutive successful reviews (used for graduated intervals)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS repetitions integer DEFAULT 0;

-- last_reviewed_at: timestamp of last review
ALTER TABLE cards ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

-- Optional: RLS policy for updating cards (if you use RLS and updates fail)
-- Uncomment if card updates fail with permission error:
/*
DROP POLICY IF EXISTS "Users can update cards in own decks" ON cards;
CREATE POLICY "Users can update cards in own decks"
ON cards FOR UPDATE
USING (
  deck_id IN (
    SELECT deck_id FROM decks WHERE creator_id = auth.uid()
  )
);
*/
