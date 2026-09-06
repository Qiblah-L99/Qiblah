-- Temporary access model: this follows the current public-key super-admin setup.
-- Replace the anon write policies when authenticated super-admin access is added.
create table if not exists public.ramadan_settings (
  id text primary key default 'global',
  hijri_year integer not null,
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  constraint ramadan_settings_global_row check (id = 'global'),
  constraint ramadan_settings_valid_year check (hijri_year between 1400 and 1600),
  constraint ramadan_settings_valid_duration check (end_date - start_date in (28, 29))
);

alter table public.ramadan_settings enable row level security;

grant select, insert, update on table public.ramadan_settings to anon;
grant select on table public.ramadan_settings to authenticated;

drop policy if exists "Public can read Ramadan settings" on public.ramadan_settings;
create policy "Public can read Ramadan settings"
  on public.ramadan_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Temporary super admin can create Ramadan settings" on public.ramadan_settings;
create policy "Temporary super admin can create Ramadan settings"
  on public.ramadan_settings
  for insert
  to anon
  with check (id = 'global');

drop policy if exists "Temporary super admin can update Ramadan settings" on public.ramadan_settings;
create policy "Temporary super admin can update Ramadan settings"
  on public.ramadan_settings
  for update
  to anon
  using (id = 'global')
  with check (id = 'global');

insert into public.ramadan_settings (id, hijri_year, start_date, end_date)
values ('global', 1448, date '2027-02-08', date '2027-03-09')
on conflict (id) do nothing;
