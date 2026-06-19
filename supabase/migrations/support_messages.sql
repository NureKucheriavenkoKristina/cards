-- ── support_messages ──────────────────────────────────────────────
create table if not exists support_messages (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  user_id     uuid        references auth.users(id) on delete set null,
  type        text        not null    check (type in ('bug', 'suggestion', 'complaint')),
  message     text        not null,
  is_read     boolean     not null    default false
);

alter table support_messages enable row level security;

create policy "Users can submit support messages"
  on support_messages for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Admins can view support messages"
  on support_messages for select to authenticated
  using (exists (
    select 1 from user_profiles where user_id = auth.uid() and is_admin = true
  ));

create policy "Admins can update support messages"
  on support_messages for update to authenticated
  using (exists (
    select 1 from user_profiles where user_id = auth.uid() and is_admin = true
  ));

create policy "Admins can delete support messages"
  on support_messages for delete to authenticated
  using (exists (
    select 1 from user_profiles where user_id = auth.uid() and is_admin = true
  ));

-- ── RPCs ──────────────────────────────────────────────────────────
create or replace function admin_get_all_support_messages()
returns table (
  id         uuid,
  created_at timestamptz,
  type       text,
  message    text,
  is_read    boolean,
  user_id    uuid,
  username   text,
  email      text
)
language sql security definer set search_path = public as $$
  select
    sm.id,
    sm.created_at,
    sm.type,
    sm.message,
    sm.is_read,
    sm.user_id,
    coalesce(up.username, 'Anonymous') as username,
    coalesce(au.email, '')             as email
  from support_messages sm
  left join user_profiles up on up.user_id = sm.user_id
  left join auth.users    au on au.id       = sm.user_id
  order by sm.is_read asc, sm.created_at desc;
$$;

create or replace function admin_read_support_message(p_id uuid)
returns void language sql security definer as $$
  update support_messages set is_read = true where id = p_id;
$$;

create or replace function admin_delete_support_message(p_id uuid)
returns void language sql security definer as $$
  delete from support_messages where id = p_id;
$$;
