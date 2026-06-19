-- ═══════════════════════════════════════════════════════════════
-- Add created_by to cards table + helper RPC
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- RPC: get display name for a single user (used by deck-detail to show card author)
CREATE OR REPLACE FUNCTION public.get_user_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    raw_user_meta_data->>'username',
    split_part(email, '@', 1)
  )
  FROM auth.users
  WHERE id = p_user_id;
$$;
