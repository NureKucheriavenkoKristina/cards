-- Fix 403 on user_card_progress
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor → New query
-- Then click "Run"

-- 1. Enable RLS (required for policies to apply)
ALTER TABLE user_card_progress ENABLE ROW LEVEL SECURITY;

-- 2. Remove any conflicting policies
DROP POLICY IF EXISTS "Users can read own card progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can insert own card progress" ON user_card_progress;
DROP POLICY IF EXISTS "Users can update own card progress" ON user_card_progress;

-- 3. SELECT: users can read only their own rows
CREATE POLICY "Users can read own card progress"
ON user_card_progress FOR SELECT
USING (user_id = auth.uid());

-- 4. INSERT: users can insert only rows where user_id = their id
CREATE POLICY "Users can insert own card progress"
ON user_card_progress FOR INSERT
WITH CHECK (user_id = auth.uid());

-- 5. UPDATE: users can update only their own rows
CREATE POLICY "Users can update own card progress"
ON user_card_progress FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
