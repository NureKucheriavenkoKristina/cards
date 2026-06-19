-- Allow authenticated users to read public profile fields on `users`
-- so comment/rating screens can show author names (username).
--
-- Run in Supabase Dashboard → SQL Editor.
-- If your table is named differently (e.g. `profiles`), adjust the table name.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_username_for_authenticated" ON users;
CREATE POLICY "users_select_username_for_authenticated"
ON users FOR SELECT
TO authenticated
USING (true);
