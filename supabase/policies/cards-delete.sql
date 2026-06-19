-- RLS policy: allow users to delete cards only from their own decks
-- Run this in Supabase SQL Editor if delete fails with RLS error

create policy "Users can delete cards from own decks"
on cards
for delete
using (
  deck_id in (
    select deck_id from decks
    where creator_id = auth.uid()
  )
);
