-- Complaints on deck reviews (pack_comments). Reporters must be logged in; cannot report own comment.

CREATE TABLE IF NOT EXISTS public.pack_comment_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.pack_comments (id) ON DELETE CASCADE,
  deck_id uuid NOT NULL REFERENCES public.decks (deck_id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  issue_key text NOT NULL,
  details text,
  gemini_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pack_comment_complaints_issue_key_check CHECK (
    issue_key IN (
      'spam_scam',
      'hate_harassment',
      'sexual_violence',
      'copyright',
      'misleading',
      'other'
    )
  ),
  CONSTRAINT pack_comment_complaints_details_len CHECK (details IS NULL OR char_length(details) <= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS pack_comment_complaints_comment_reporter_uidx
  ON public.pack_comment_complaints (comment_id, reporter_id);

CREATE INDEX IF NOT EXISTS pack_comment_complaints_deck_id_idx ON public.pack_comment_complaints (deck_id);
CREATE INDEX IF NOT EXISTS pack_comment_complaints_created_at_idx ON public.pack_comment_complaints (created_at DESC);

ALTER TABLE public.pack_comment_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pack_comment_complaints_insert ON public.pack_comment_complaints;
CREATE POLICY pack_comment_complaints_insert
ON public.pack_comment_complaints
FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.pack_comments pc
    INNER JOIN public.decks d ON d.deck_id = pc.deck_id
    WHERE pc.id = pack_comment_complaints.comment_id
      AND pc.deck_id = pack_comment_complaints.deck_id
      AND pc.user_id <> (SELECT auth.uid())
      AND (
        d.is_public = true
        OR d.creator_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.deck_collaborators dc
          WHERE dc.deck_id = d.deck_id
            AND dc.user_id = (SELECT auth.uid())
            AND dc.status = 'accepted'
        )
      )
  )
);

DROP POLICY IF EXISTS pack_comment_complaints_select_own ON public.pack_comment_complaints;
CREATE POLICY pack_comment_complaints_select_own
ON public.pack_comment_complaints
FOR SELECT
TO authenticated
USING (reporter_id = (SELECT auth.uid()));

-- Admin: list all comment complaints
DROP FUNCTION IF EXISTS public.admin_get_all_comment_complaints();
CREATE OR REPLACE FUNCTION public.admin_get_all_comment_complaints()
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  issue_key text,
  details text,
  gemini_summary text,
  comment_id uuid,
  comment_content text,
  comment_author_id uuid,
  deck_id uuid,
  deck_title text,
  reporter_id uuid,
  reporter_name text,
  comment_author_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN;
  END IF;

  SET LOCAL row_security = off;

  RETURN QUERY
  SELECT
    c.id,
    c.created_at::timestamptz,
    c.issue_key,
    c.details,
    c.gemini_summary,
    c.comment_id,
    pc.content,
    pc.user_id,
    c.deck_id,
    COALESCE(d.title, '—')::text,
    c.reporter_id,
    COALESCE(ru.username, split_part(au.email, '@', 1), 'Unknown')::text,
    COALESCE(cu.username, split_part(acu.email, '@', 1), 'Unknown')::text
  FROM public.pack_comment_complaints c
  INNER JOIN public.pack_comments pc ON pc.id = c.comment_id
  LEFT JOIN public.decks d ON d.deck_id = c.deck_id
  LEFT JOIN public.users ru ON ru.user_id = c.reporter_id
  LEFT JOIN auth.users au ON au.id = c.reporter_id
  LEFT JOIN public.users cu ON cu.user_id = pc.user_id
  LEFT JOIN auth.users acu ON acu.id = pc.user_id
  ORDER BY c.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_dismiss_comment_complaint(uuid);
CREATE OR REPLACE FUNCTION public.admin_dismiss_comment_complaint(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SET LOCAL row_security = off;
  DELETE FROM public.pack_comment_complaints WHERE id = p_id;
END;
$$;
