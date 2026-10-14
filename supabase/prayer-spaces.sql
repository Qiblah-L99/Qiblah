create extension if not exists pgcrypto;

create table if not exists public.prayer_spaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  venue text,
  address text,
  area text not null,
  city text default 'London',
  type text default 'Other',
  hours text,
  jummah_times text[] not null default '{}',
  jummah_notes text,
  notes text,
  facilities text[] not null default '{}',
  url text,
  lat double precision,
  lon double precision,
  sort_order integer not null default 0,
  active boolean not null default true
);

alter table public.prayer_spaces add column if not exists jummah_times text[] not null default '{}';
alter table public.prayer_spaces add column if not exists jummah_notes text;

alter table public.prayer_spaces enable row level security;

drop policy if exists "prayer_spaces_select" on public.prayer_spaces;
create policy "prayer_spaces_select"
on public.prayer_spaces
for select
to anon, authenticated
using (true);

drop policy if exists "prayer_spaces_insert" on public.prayer_spaces;
create policy "prayer_spaces_insert"
on public.prayer_spaces
for insert
to anon, authenticated
with check (true);

drop policy if exists "prayer_spaces_update" on public.prayer_spaces;
create policy "prayer_spaces_update"
on public.prayer_spaces
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "prayer_spaces_delete" on public.prayer_spaces;
create policy "prayer_spaces_delete"
on public.prayer_spaces
for delete
to anon, authenticated
using (true);

create index if not exists prayer_spaces_sort_order_idx on public.prayer_spaces(sort_order, name);
create index if not exists prayer_spaces_active_idx on public.prayer_spaces(active);
