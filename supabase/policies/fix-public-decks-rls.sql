-- FIX: Public decks not showing for other users
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor → New query
-- Then click "Run" (or Ctrl+Enter)
--
-- This enables users to see public decks from other users on the "Public decks" screen,
-- and to read cards in those decks.

-- ========== 1. DECKS TABLE: Allow reading public decks ==========
-- Drop any existing SELECT policies that might block public decks
DROP POLICY IF EXISTS "Anyone can read public decks" ON decks;
DROP POLICY IF EXISTS "Users can read own decks" ON decks;
DROP POLICY IF EXISTS "Users can read decks" ON decks;
DROP POLICY IF EXISTS "Allow read for deck owner" ON decks;
DROP POLICY IF EXISTS "Enable read access for users who own the deck" ON decks;

-- Single policy: users can read their own decks OR any public deck
CREATE POLICY "Anyone can read public decks"
ON decks FOR SELECT
TO authenticated
USING (is_public = true OR creator_id = auth.uid());

-- ========== 2. CARDS TABLE: Allow reading cards in public decks ==========
-- Without this, viewing a public deck's detail would fail (cards query returns empty)
DROP POLICY IF EXISTS "Users can read cards from own or public decks" ON cards;
DROP POLICY IF EXISTS "Users can read cards in own decks" ON cards;
DROP POLICY IF EXISTS "Allow read cards" ON cards;

CREATE POLICY "Users can read cards from own or public decks"
ON cards FOR SELECT
TO authenticated
USING (
  deck_id IN (
    SELECT deck_id FROM decks
    WHERE creator_id = auth.uid() OR is_public = true
  )
);
