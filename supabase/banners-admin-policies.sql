-- Allow the static Super Admin dashboard to manage ad banners.
-- Run this in Supabase SQL Editor for project bfevwoykvnogmgxdkxdj.

alter table public.banners enable row level security;
alter table public.banners add column if not exists logo_url text;

drop policy if exists "Public can read banners" on public.banners;
drop policy if exists "Super admin can insert banners" on public.banners;
drop policy if exists "Super admin can update banners" on public.banners;
drop policy if exists "Super admin can delete banners" on public.banners;

create policy "Public can read banners"
on public.banners
for select
to anon
using (true);

create policy "Super admin can insert banners"
on public.banners
for insert
to anon
with check (true);

create policy "Super admin can update banners"
on public.banners
for update
to anon
using (true)
with check (true);

create policy "Super admin can delete banners"
on public.banners
for delete
to anon
using (true);

insert into public.banners (
  title,
  image_url,
  link_url,
  alt_text,
  position,
  active,
  start_date,
  end_date,
  sort_order,
  label,
  subtitle,
  button_text
)
select
  'Qiblah is Coming to East London · September 2026',
  '',
  null,
  'A platform for Mosques, Institutions and Local services',
  'home',
  true,
  null,
  null,
  0,
  'Your community, one platform.',
  'A platform for Mosques, Institutions and Local services',
  'Register →'
where not exists (
  select 1
  from public.banners
  where title = 'Qiblah is Coming to East London · September 2026'
);
