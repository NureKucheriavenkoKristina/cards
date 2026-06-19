-- RLS policies for user_card_progress
-- Users can only read/insert/update their own progress (user_id = auth.uid())
-- Run in Supabase SQL Editor if you get permission errors

-- Enable RLS (if not already)
ALTER TABLE user_card_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing if re-running
DROP POLICY IF EXISTS "Users can read own card progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can insert own card progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can update own card progress" ON user_card_progress;

-- Allow users to read their own progress
CREATE POLICY "Users can read own card progress"
ON user_card_progress FOR SELECT
USING (user_id = auth.uid());

-- Allow users to insert their own progress
CREATE POLICY "Users can insert own card progress"
ON user_card_progress FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Allow users to update their own progress
CREATE POLICY "Users can update own card progress"
ON user_card_progress FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
