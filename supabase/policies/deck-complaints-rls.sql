-- Deck complaints RLS (same as migrations/deck_complaints.sql policies section).
-- Run in Supabase Dashboard → SQL Editor if the table already exists without policies.

ALTER TABLE public.deck_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deck_complaints_insert_report ON public.deck_complaints;
CREATE POLICY deck_complaints_insert_report
ON public.deck_complaints
FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.decks d
    WHERE d.deck_id = deck_id
      AND d.is_public = true
      AND d.creator_id <> (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS deck_complaints_select_own ON public.deck_complaints;
CREATE POLICY deck_complaints_select_own
ON public.deck_complaints
FOR SELECT
TO authenticated
USING (reporter_id = (SELECT auth.uid()));
