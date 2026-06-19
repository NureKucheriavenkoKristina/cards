-- Allow unauthenticated (anon key) users to browse public decks, card counts, and ratings.
-- Existing policies target TO authenticated only, so guests saw empty lists / RLS errors.

-- ========== DECKS ==========
DROP POLICY IF EXISTS "anon_select_public_decks" ON public.decks;
CREATE POLICY "anon_select_public_decks"
ON public.decks FOR SELECT
TO anon
USING (is_public = true);

-- ========== CARDS (deck detail / previews for guests) ==========
DROP POLICY IF EXISTS "anon_select_cards_in_public_decks" ON public.cards;
CREATE POLICY "anon_select_cards_in_public_decks"
ON public.cards FOR SELECT
TO anon
USING (
  deck_id IN (SELECT deck_id FROM public.decks WHERE is_public = true)
);

-- ========== PACK_RATINGS (aggregates on public-decks list) ==========
DROP POLICY IF EXISTS "anon_select_pack_ratings_public_decks" ON public.pack_ratings;
CREATE POLICY "anon_select_pack_ratings_public_decks"
ON public.pack_ratings FOR SELECT
TO anon
USING (
  deck_id IN (SELECT deck_id FROM public.decks WHERE is_public = true)
);
