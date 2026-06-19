-- ═══════════════════════════════════════════════════════════════
-- Sync auth.users ↔ public.users
-- ═══════════════════════════════════════════════════════════════

-- 1. Trigger: auto-create public.users row when someone registers
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (user_id, email, username, "isAdmin", registration_date)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    false,
    NOW()
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 2. Fix existing rows: update user_id in public.users to match auth.users.id by email
UPDATE public.users pu
SET user_id = au.id
FROM auth.users au
WHERE LOWER(au.email) = LOWER(pu.email)
  AND pu.user_id IS DISTINCT FROM au.id;

-- 3. Insert missing users (registered via auth but not in public.users)
INSERT INTO public.users (user_id, email, username, "isAdmin", registration_date)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)),
  false,
  au.created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.email = au.email
)
ON CONFLICT DO NOTHING;

-- 4. RPC: reliable admin check (works even if UUIDs were mismatched before fix)
CREATE OR REPLACE FUNCTION public.get_my_admin_status()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Primary: by synced user_id
    (SELECT "isAdmin" FROM public.users WHERE user_id = auth.uid()),
    -- Fallback: by email (for legacy rows)
    (SELECT "isAdmin"
       FROM public.users
      WHERE LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
      LIMIT 1),
    false
  );
$$;
