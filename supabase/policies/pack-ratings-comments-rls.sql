-- RLS POLICY FIX: pack_ratings & pack_comments
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor → New query → Run
--
-- Goal:
-- - Any authenticated user can read ratings/comments for:
--   - public decks OR decks they own
-- - Any authenticated user can INSERT/UPDATE their own rating for:
--   - public decks OR decks they own
--
-- This should fix:
-- - "new row violates row level security policy for table pack_ratings"
-- - "user can't rate their own deck, but can rate others' decks"

-- =========================
-- pack_ratings
-- =========================

ALTER TABLE pack_ratings ENABLE ROW LEVEL SECURITY;

-- SELECT: visible if deck is public or owned by the viewer
CREATE POLICY IF NOT EXISTS "pack_ratings_select_public_or_owned_deck"
ON pack_ratings FOR SELECT
TO authenticated
USING (
  deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);

-- INSERT: user_id must match auth.uid(), and deck must be public or owned
CREATE POLICY IF NOT EXISTS "pack_ratings_insert_public_or_owned_deck"
ON pack_ratings FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);

-- UPDATE: only update your own rating row, and only for accessible decks
CREATE POLICY IF NOT EXISTS "pack_ratings_update_public_or_owned_deck"
ON pack_ratings FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);


-- =========================
-- pack_comments
-- =========================

ALTER TABLE pack_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: visible if deck is public or owned by the viewer
CREATE POLICY IF NOT EXISTS "pack_comments_select_public_or_owned_deck"
ON pack_comments FOR SELECT
TO authenticated
USING (
  deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);

-- INSERT: user_id must match auth.uid(), and deck must be public or owned
CREATE POLICY IF NOT EXISTS "pack_comments_insert_public_or_owned_deck"
ON pack_comments FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);

-- UPDATE: only your own comment rows, for accessible decks
CREATE POLICY IF NOT EXISTS "pack_comments_update_public_or_owned_deck"
ON pack_comments FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);

-- DELETE: only your own comment rows, for accessible decks
CREATE POLICY IF NOT EXISTS "pack_comments_delete_public_or_owned_deck"
ON pack_comments FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND deck_id IN (
    SELECT d.deck_id
    FROM decks d
    WHERE d.is_public = true OR d.creator_id = auth.uid()
  )
);

