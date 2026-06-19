-- RLS for "Add to my account" - copying public decks
-- Run in Supabase SQL Editor if copy fails with 403/permission error

-- ========== DECKS: Allow insert (create new deck, including copies) ==========
DROP POLICY IF EXISTS "Users can insert own decks" ON decks;
CREATE POLICY "Users can insert own decks"
ON decks FOR INSERT
TO authenticated
WITH CHECK (creator_id = auth.uid());

-- ========== CARDS: Allow insert into own decks ==========
DROP POLICY IF EXISTS "Users can insert cards into own decks" ON cards;
CREATE POLICY "Users can insert cards into own decks"
ON cards FOR INSERT
TO authenticated
WITH CHECK (
  deck_id IN (
    SELECT deck_id FROM decks WHERE creator_id = auth.uid()
  )
);
