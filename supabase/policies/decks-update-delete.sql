-- RLS policies: дозволити користувачам оновлювати та видаляти свої дошки
-- ВИКОНАЙ цей SQL у Supabase Dashboard → SQL Editor
-- Якщо edit/delete не працюють – зазвичай причина в відсутності цих політик

drop policy if exists "Users can update own decks" on decks;
drop policy if exists "Users can delete own decks" on decks;

create policy "Users can update own decks"
on decks
for update
using (creator_id = auth.uid())
with check (creator_id = auth.uid());

create policy "Users can delete own decks"
on decks
for delete
using (creator_id = auth.uid());
