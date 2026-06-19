-- Deck complaints: users report issues with other users' public decks.
-- Run in Supabase SQL Editor or via migration tooling.

CREATE TABLE IF NOT EXISTS public.deck_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.decks (deck_id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  issue_key text NOT NULL,
  details text,
  gemini_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_complaints_issue_key_check CHECK (
    issue_key IN (
      'spam_scam',
      'hate_harassment',
      'sexual_violence',
      'copyright',
      'misleading',
      'other'
    )
  ),
  CONSTRAINT deck_complaints_details_len CHECK (details IS NULL OR char_length(details) <= 2000)
);

CREATE INDEX IF NOT EXISTS deck_complaints_deck_id_idx ON public.deck_complaints (deck_id);
CREATE INDEX IF NOT EXISTS deck_complaints_reporter_id_idx ON public.deck_complaints (reporter_id);
CREATE INDEX IF NOT EXISTS deck_complaints_created_at_idx ON public.deck_complaints (created_at DESC);

ALTER TABLE public.deck_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deck_complaints_insert_report ON public.deck_complaints;
DROP POLICY IF EXISTS deck_complaints_select_own ON public.deck_complaints;

-- Authenticated users may insert only for themselves, and only for public decks they do not own.
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

-- Reporters can read their own submissions (e.g. future "my reports" UI).
CREATE POLICY deck_complaints_select_own
ON public.deck_complaints
FOR SELECT
TO authenticated
USING (reporter_id = (SELECT auth.uid()));
