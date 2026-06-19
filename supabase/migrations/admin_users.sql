-- ═══════════════════════════════════════════════════════════════
-- Admin: User management RPCs
-- ═══════════════════════════════════════════════════════════════

-- RPC: get all users with stats
DROP FUNCTION IF EXISTS public.admin_get_all_users();
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(
  user_id           UUID,
  username          TEXT,
  email             TEXT,
  avatar_url        TEXT,
  registration_date TIMESTAMPTZ,
  is_admin          BOOLEAN,
  deck_count        BIGINT,
  last_sign_in      TIMESTAMPTZ
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
    pu.user_id,
    pu.username,
    pu.email,
    pu.avatar_url,
    pu.registration_date::TIMESTAMPTZ,
    COALESCE(pu."isAdmin", false)           AS is_admin,
    COUNT(DISTINCT d.deck_id)               AS deck_count,
    au.last_sign_in_at                      AS last_sign_in
  FROM public.users pu
  LEFT JOIN public.decks  d  ON d.creator_id = pu.user_id
  LEFT JOIN auth.users    au ON au.id         = pu.user_id
  GROUP BY pu.user_id, pu.username, pu.email, pu.avatar_url,
           pu.registration_date, pu."isAdmin", au.last_sign_in_at
  ORDER BY pu.registration_date DESC;
END;
$$;

-- RPC: toggle admin status for a user
DROP FUNCTION IF EXISTS public.admin_set_admin(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_set_admin(p_user_id UUID, p_is_admin BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  -- Prevent removing own admin status
  IF p_user_id = auth.uid() AND NOT p_is_admin THEN
    RAISE EXCEPTION 'Cannot remove your own admin status';
  END IF;
  SET LOCAL row_security = off;
  UPDATE public.users SET "isAdmin" = p_is_admin WHERE user_id = p_user_id;
END;
$$;

-- RPC: delete a user (removes from public.users; auth user stays unless cascaded)
DROP FUNCTION IF EXISTS public.admin_delete_user(UUID);
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;
  SET LOCAL row_security = off;
  -- Delete user data (cascades to decks, cards, comments via FK)
  DELETE FROM public.users WHERE user_id = p_user_id;
  -- Also remove from auth (requires superuser; works in SECURITY DEFINER)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- Update admin_get_stats to include users count correctly
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS TABLE(
  total_users      BIGINT,
  total_decks      BIGINT,
  total_cards      BIGINT,
  total_complaints BIGINT,
  total_comments   BIGINT
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
    (SELECT COUNT(*) FROM public.users)           AS total_users,
    (SELECT COUNT(*) FROM public.decks)           AS total_decks,
    (SELECT COUNT(*) FROM public.cards)           AS total_cards,
    (SELECT COUNT(*) FROM public.deck_complaints) AS total_complaints,
    (SELECT COUNT(*) FROM public.pack_comments)   AS total_comments;
END;
$$;
