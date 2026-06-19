-- Admin moderation when public.users marks the current user as admin.
-- Requires public.users (user_id = auth.uid()) and boolean isAdmin (or isadmin — adjust to match your column).

DROP POLICY IF EXISTS deck_complaints_select_admin ON public.deck_complaints;
CREATE POLICY deck_complaints_select_admin
ON public.deck_complaints
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = (SELECT auth.uid())
    AND COALESCE(u."isAdmin", false) = true
  )
);

DROP POLICY IF EXISTS decks_select_admin ON public.decks;
CREATE POLICY decks_select_admin
ON public.decks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = (SELECT auth.uid())
    AND COALESCE(u."isAdmin", false) = true
  )
);
