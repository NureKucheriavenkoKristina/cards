-- Allow users to read PUBLIC decks from other users (for "Public decks" screen)
-- Run in Supabase SQL Editor
-- Without this, RLS blocks reading decks where creator_id != auth.uid()

-- Drop if exists (for re-running)
DROP POLICY IF EXISTS "Anyone can read public decks" ON decks;

-- Allow SELECT for decks that are public (so users can browse others' public decks)
CREATE POLICY "Anyone can read public decks"
ON decks FOR SELECT
USING (is_public = true OR creator_id = auth.uid());
