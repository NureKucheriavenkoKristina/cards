-- ═══════════════════════════════════════════════════════════════
-- Invitation system for deck co-authors
-- Run AFTER deck_collaborators.sql
-- ═══════════════════════════════════════════════════════════════

-- 1. Add status column to track invitation lifecycle
ALTER TABLE public.deck_collaborators
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined'));

-- 2. Allow invited user to update their own row (accept/decline)
DROP POLICY IF EXISTS "collaborators_update" ON public.deck_collaborators;
CREATE POLICY "collaborators_update" ON public.deck_collaborators
  FOR UPDATE USING (auth.uid() = user_id);

-- 3. RPC: get pending invitations for current user
CREATE OR REPLACE FUNCTION public.get_my_invitations()
RETURNS TABLE(
  deck_id      UUID,
  deck_title   TEXT,
  invited_by   UUID,
  inviter_name TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.deck_id,
    d.title AS deck_title,
    dc.invited_by,
    COALESCE(
      au.raw_user_meta_data->>'username',
      split_part(au.email, '@', 1)
    ) AS inviter_name,
    dc.created_at
  FROM public.deck_collaborators dc
  JOIN public.decks d ON d.deck_id = dc.deck_id
  LEFT JOIN auth.users au ON au.id = dc.invited_by
  WHERE dc.user_id = auth.uid()
    AND dc.status = 'pending';
$$;

-- 4. RPC: accept or decline an invitation
CREATE OR REPLACE FUNCTION public.respond_to_invitation(
  p_deck_id UUID,
  p_accept  BOOLEAN
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.deck_collaborators
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  WHERE deck_id = p_deck_id
    AND user_id  = auth.uid()
    AND status   = 'pending';
$$;

-- 5. Update get_deck_collaborators to include status field
CREATE OR REPLACE FUNCTION public.get_deck_collaborators(p_deck_id UUID)
RETURNS TABLE(
  deck_id      UUID,
  user_id      UUID,
  username     TEXT,
  display_name TEXT,
  avatar_url   TEXT,
  role         TEXT,
  status       TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.deck_id,
    dc.user_id,
    COALESCE(
      au.raw_user_meta_data->>'username',
      split_part(au.email, '@', 1)
    )                                    AS username,
    COALESCE(
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'username',
      split_part(au.email, '@', 1)
    )                                    AS display_name,
    au.raw_user_meta_data->>'avatar_url' AS avatar_url,
    dc.role,
    dc.status,
    dc.created_at
  FROM public.deck_collaborators dc
  JOIN auth.users au ON au.id = dc.user_id
  WHERE dc.deck_id = p_deck_id
    AND (
      -- owner sees all (pending, accepted, declined)
      auth.uid() IN (
        SELECT creator_id FROM public.decks WHERE deck_id = p_deck_id
      )
      -- collaborator only sees their own accepted row
      OR (auth.uid() = dc.user_id AND dc.status = 'accepted')
    );
$$;
