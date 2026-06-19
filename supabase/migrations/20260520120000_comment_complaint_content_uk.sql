-- Ukrainian display text for quoted review in admin (moderation).

ALTER TABLE public.pack_comment_complaints
  ADD COLUMN IF NOT EXISTS comment_content_uk text;

COMMENT ON COLUMN public.pack_comment_complaints.comment_content_uk IS
  'Ukrainian translation of quoted pack_comments.content for admin UI';

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
  comment_content_uk text,
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
    c.comment_content_uk,
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
