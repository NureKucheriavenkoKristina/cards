-- Allows an authenticated user to delete their own account.
-- Includes cleanup of user-owned decks and cards before removing auth user.

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.cards
  where deck_id in (
    select deck_id
    from public.decks
    where creator_id = uid
  );

  delete from public.decks
  where creator_id = uid;

  delete from auth.users
  where id = uid;
end;
$$;

grant execute on function public.delete_current_user() to authenticated;
