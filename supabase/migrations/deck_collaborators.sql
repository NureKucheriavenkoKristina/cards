-- ═══════════════════════════════════════════════════════════════
-- deck_collaborators — co-authors for decks  (v3)
-- Searches auth.users directly (works even without public.users sync)
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure table exists with correct structure
CREATE TABLE IF NOT EXISTS public.deck_collaborators (
  deck_id     UUID NOT NULL REFERENCES public.decks(deck_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
  invited_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);

-- Add columns if table existed without them
ALTER TABLE public.deck_collaborators
  ADD COLUMN IF NOT EXISTS role        TEXT NOT NULL DEFAULT 'editor',
  ADD COLUMN IF NOT EXISTS invited_by  UUID,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();

-- Drop FK to public.users if it exists (we use auth.users.id directly)
ALTER TABLE public.deck_collaborators
  DROP CONSTRAINT IF EXISTS deck_collaborators_user_id_fkey;

-- 2. Enable RLS
ALTER TABLE public.deck_collaborators ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "collaborators_select" ON public.deck_collaborators;
DROP POLICY IF EXISTS "collaborators_insert" ON public.deck_collaborators;
DROP POLICY IF EXISTS "collaborators_delete" ON public.deck_collaborators;

CREATE POLICY "collaborators_select" ON public.deck_collaborators
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() = invited_by
    OR auth.uid() IN (
      SELECT creator_id FROM public.decks WHERE deck_id = deck_collaborators.deck_id
    )
  );

CREATE POLICY "collaborators_insert" ON public.deck_collaborators
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT creator_id FROM public.decks WHERE deck_id = deck_collaborators.deck_id
    )
    AND auth.uid() != user_id
  );

CREATE POLICY "collaborators_delete" ON public.deck_collaborators
  FOR DELETE USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT creator_id FROM public.decks WHERE deck_id = deck_collaborators.deck_id
    )
  );

-- ───────────────────────────────────────────────────────────────
-- RPC: find user by username OR email
-- Searches auth.users directly (guaranteed to have email + metadata)
-- Returns auth.users.id as user_id so it works with auth.uid()
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_user_by_username(search_username TEXT)
RETURNS TABLE(
  user_id      UUID,
  username     TEXT,
  display_name TEXT,
  avatar_url   TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    au.id                                                                    AS user_id,
    COALESCE(
      au.raw_user_meta_data->>'username',
      split_part(au.email, '@', 1)
    )                                                                        AS username,
    COALESCE(
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'username',
      split_part(au.email, '@', 1)
    )                                                                        AS display_name,
    au.raw_user_meta_data->>'avatar_url'                                     AS avatar_url
  FROM auth.users au
  WHERE (
    au.email ILIKE search_username
    OR au.raw_user_meta_data->>'username' ILIKE search_username
  )
    AND au.id != auth.uid()   -- exclude yourself
  LIMIT 5;
$$;

-- ───────────────────────────────────────────────────────────────
-- RPC: get deck collaborators with user info (from auth.users)
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_deck_collaborators(p_deck_id UUID)
RETURNS TABLE(
  deck_id      UUID,
  user_id      UUID,
  username     TEXT,
  display_name TEXT,
  avatar_url   TEXT,
  role         TEXT,
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
    dc.created_at
  FROM public.deck_collaborators dc
  JOIN auth.users au ON au.id = dc.user_id
  WHERE dc.deck_id = p_deck_id
    AND (
      auth.uid() IN (
        SELECT creator_id FROM public.decks WHERE deck_id = p_deck_id
      )
      OR auth.uid() = dc.user_id
    );
$$;
