-- ═══════════════════════════════════════════════════════════════
-- Admin Panel RPCs
-- ═══════════════════════════════════════════════════════════════

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Primary: by synced user_id
    (SELECT "isAdmin" FROM public.users WHERE user_id = auth.uid()),
    -- Fallback: by email (handles UUID mismatch before sync)
    (SELECT "isAdmin"
       FROM public.users
      WHERE LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
      LIMIT 1),
    false
  );
$$;

-- RPC: get all comments (admin only)
DROP FUNCTION IF EXISTS public.admin_get_all_comments();
CREATE OR REPLACE FUNCTION public.admin_get_all_comments()
RETURNS TABLE(
  id          UUID,
  content     TEXT,
  created_at  TIMESTAMPTZ,
  user_id     UUID,
  deck_id     UUID,
  username    TEXT,
  deck_title  TEXT
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
    pc.id,
    pc.content,
    pc.created_at::TIMESTAMPTZ,
    pc.user_id,
    pc.deck_id,
    COALESCE(
      u.username,
      split_part(au.email, '@', 1),
      'Unknown'
    )::TEXT AS username,
    COALESCE(d.title, '—')::TEXT AS deck_title
  FROM public.pack_comments pc
  LEFT JOIN public.users      u  ON u.user_id  = pc.user_id
  LEFT JOIN auth.users        au ON au.id       = pc.user_id
  LEFT JOIN public.decks      d  ON d.deck_id   = pc.deck_id
  ORDER BY pc.created_at DESC;
END;
$$;

-- RPC: get all complaints with reporter name (admin only)
DROP FUNCTION IF EXISTS public.admin_get_all_complaints();
CREATE OR REPLACE FUNCTION public.admin_get_all_complaints()
RETURNS TABLE(
  id              UUID,
  created_at      TIMESTAMPTZ,
  issue_key       TEXT,
  details         TEXT,
  gemini_summary  TEXT,
  deck_id         UUID,
  deck_title      TEXT,
  reporter_id     UUID,
  reporter_name   TEXT
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
    dc.id,
    dc.created_at::TIMESTAMPTZ,
    dc.issue_key,
    dc.details,
    dc.gemini_summary,
    dc.deck_id,
    COALESCE(d.title, '—')::TEXT AS deck_title,
    dc.reporter_id,
    COALESCE(
      u.username,
      split_part(au.email, '@', 1),
      'Unknown'
    )::TEXT AS reporter_name
  FROM public.deck_complaints dc
  LEFT JOIN public.decks d  ON d.deck_id  = dc.deck_id
  LEFT JOIN public.users u  ON u.user_id  = dc.reporter_id
  LEFT JOIN auth.users   au ON au.id      = dc.reporter_id
  ORDER BY dc.created_at DESC;
END;
$$;

-- RPC: delete a comment (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_id UUID)
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
  DELETE FROM public.pack_comments WHERE id = p_id;
END;
$$;

-- RPC: dismiss a complaint (admin only)
CREATE OR REPLACE FUNCTION public.admin_dismiss_complaint(p_id UUID)
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
  DELETE FROM public.deck_complaints WHERE id = p_id;
END;
$$;

-- RPC: delete a deck (admin only) — cascades cards, complaints
CREATE OR REPLACE FUNCTION public.admin_delete_deck(p_deck_id UUID)
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
  DELETE FROM public.decks WHERE deck_id = p_deck_id;
END;
$$;

-- Stats for admin overview
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS TABLE(
  total_users     BIGINT,
  total_decks     BIGINT,
  total_cards     BIGINT,
  total_complaints BIGINT,
  total_comments  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.users)           AS total_users,
    (SELECT COUNT(*) FROM public.decks)           AS total_decks,
    (SELECT COUNT(*) FROM public.cards)           AS total_cards,
    (SELECT COUNT(*) FROM public.deck_complaints) AS total_complaints,
    (SELECT COUNT(*) FROM public.pack_comments)   AS total_comments
  WHERE public.is_admin();
$$;
