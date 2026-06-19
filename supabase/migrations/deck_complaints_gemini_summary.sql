-- Optional AI-generated moderation summary (Gemini). Safe to run after deck_complaints exists.

ALTER TABLE public.deck_complaints
  ADD COLUMN IF NOT EXISTS gemini_summary text;

COMMENT ON COLUMN public.deck_complaints.gemini_summary IS 'Short moderator-facing summary from Gemini (optional).';
