-- ─── card_complaints table ───────────────────────────────────────────────────
create table if not exists public.card_complaints (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  card_id       uuid not null references public.cards(card_id) on delete cascade,
  deck_id       uuid not null references public.decks(deck_id) on delete cascade,
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  issue_key     text not null,
  details       text,
  gemini_summary text
);

alter table public.card_complaints enable row level security;

-- Reporter can insert (once per card per user)
create policy "Users can report a card"
  on public.card_complaints for insert
  with check (auth.uid() = reporter_id);

-- Admins can read all
create policy "Admins can view card complaints"
  on public.card_complaints for select
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and is_admin = true
    )
  );

-- Admins can delete
create policy "Admins can delete card complaints"
  on public.card_complaints for delete
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and is_admin = true
    )
  );

-- ─── RPC: admin_get_all_card_complaints ──────────────────────────────────────
create or replace function public.admin_get_all_card_complaints()
returns table (
  id             uuid,
  created_at     timestamptz,
  issue_key      text,
  details        text,
  gemini_summary text,
  card_id        uuid,
  card_front_text text,
  deck_id        uuid,
  deck_title     text,
  reporter_id    uuid,
  reporter_name  text
)
language sql security definer
as $$
  select
    cc.id,
    cc.created_at,
    cc.issue_key,
    cc.details,
    cc.gemini_summary,
    cc.card_id,
    c.front_text    as card_front_text,
    cc.deck_id,
    d.title         as deck_title,
    cc.reporter_id,
    coalesce(p.username, 'unknown') as reporter_name
  from public.card_complaints cc
  join public.cards  c on c.card_id = cc.card_id
  join public.decks  d on d.deck_id = cc.deck_id
  left join public.profiles p on p.user_id = cc.reporter_id
  order by cc.created_at desc;
$$;

-- ─── RPC: admin_dismiss_card_complaint ───────────────────────────────────────
create or replace function public.admin_dismiss_card_complaint(p_id uuid)
returns void language sql security definer as $$
  delete from public.card_complaints where id = p_id;
$$;

-- ─── RPC: admin_delete_card ──────────────────────────────────────────────────
create or replace function public.admin_delete_card(p_card_id uuid)
returns void language sql security definer as $$
  delete from public.cards where card_id = p_card_id;
$$;
