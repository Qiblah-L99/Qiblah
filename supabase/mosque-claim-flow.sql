-- Mosque claim flow for Qiblah.
-- Run this in the Supabase SQL Editor for project bfevwoykvnogmgxdkxdj.
-- It adds email-verified mosque claims, domain-based auto approval,
-- and multi-admin mosque access without exposing service-role keys.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.mosque_admin_members (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role text not null default 'admin',
  status text not null default 'active',
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mosque_admin_members_role_check check (role in ('owner', 'admin', 'editor')),
  constraint mosque_admin_members_status_check check (status in ('active', 'revoked')),
  constraint mosque_admin_members_unique_user unique (mosque_id, user_id)
);

create table if not exists public.mosque_claims (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  claimant_name text not null,
  role_title text,
  phone text,
  note text,
  status text not null default 'pending',
  approval_method text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mosque_claims_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint mosque_claims_approval_method_check check (approval_method is null or approval_method in ('domain_match', 'manual')),
  constraint mosque_claims_unique_user unique (mosque_id, user_id)
);

create index if not exists mosque_admin_members_user_idx on public.mosque_admin_members(user_id, status);
create index if not exists mosque_admin_members_mosque_idx on public.mosque_admin_members(mosque_id, status);
create index if not exists mosque_claims_status_idx on public.mosque_claims(status, created_at);
create index if not exists mosque_claims_user_idx on public.mosque_claims(user_id, mosque_id);

alter table public.mosque_admin_members enable row level security;
alter table public.mosque_claims enable row level security;

grant select, insert, update on table public.mosque_claims to authenticated;
grant select on table public.mosque_admin_members to authenticated;

do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'mosques' and c.relrowsecurity) then
    grant select, update on table public.mosques to authenticated;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'services' and c.relrowsecurity) then
    grant select, insert, update, delete on table public.services to authenticated;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'announcements' and c.relrowsecurity) then
    grant select, insert, update, delete on table public.announcements to authenticated;
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'prayer_timetables' and c.relrowsecurity) then
    grant select, insert, update, delete on table public.prayer_timetables to authenticated;
  end if;
end;
$$;

drop policy if exists "Claimants can create their own mosque claims" on public.mosque_claims;
create policy "Claimants can create their own mosque claims"
on public.mosque_claims
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and lower(email::text) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "Claimants can read their own mosque claims" on public.mosque_claims;
create policy "Claimants can read their own mosque claims"
on public.mosque_claims
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Claimants can update pending own mosque claims" on public.mosque_claims;
create policy "Claimants can update pending own mosque claims"
on public.mosque_claims
for update
to authenticated
using ((select auth.uid()) = user_id and status = 'pending')
with check ((select auth.uid()) = user_id and status = 'pending');

drop policy if exists "Mosque admin members can read own memberships" on public.mosque_admin_members;
create policy "Mosque admin members can read own memberships"
on public.mosque_admin_members
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Mosque members can read own mosque profile" on public.mosques;
create policy "Mosque members can read own mosque profile"
on public.mosques
for select
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = mosques.id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);

drop policy if exists "Mosque members can update own mosque profile" on public.mosques;
create policy "Mosque members can update own mosque profile"
on public.mosques
for update
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = mosques.id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = mosques.id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);

drop policy if exists "Mosque members can manage services" on public.services;
create policy "Mosque members can manage services"
on public.services
for all
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = services.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = services.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);

drop policy if exists "Mosque members can manage announcements" on public.announcements;
create policy "Mosque members can manage announcements"
on public.announcements
for all
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = announcements.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = announcements.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);

drop policy if exists "Mosque members can manage prayer timetables" on public.prayer_timetables;
create policy "Mosque members can manage prayer timetables"
on public.prayer_timetables
for all
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = prayer_timetables.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = prayer_timetables.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);

create or replace function public.qiblah_claim_email_domain(value text)
returns text
language sql
immutable
as $$
  select lower(nullif(split_part(trim(coalesce(value, '')), '@', 2), ''));
$$;

create or replace function public.qiblah_url_domain(value text)
returns text
language plpgsql
immutable
as $$
declare
  raw text := lower(trim(coalesce(value, '')));
  host text;
begin
  if raw = '' then return null; end if;
  host := regexp_replace(raw, '^https?://', '');
  host := regexp_replace(host, '^www\.', '');
  host := split_part(host, '/', 1);
  host := split_part(host, ':', 1);
  return nullif(host, '');
end;
$$;

create or replace function public.qiblah_is_public_email_domain(domain text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(domain, '')) = any(array[
    'gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','icloud.com',
    'me.com','mac.com','yahoo.com','ymail.com','aol.com','proton.me','protonmail.com',
    'mail.com','zoho.com','gmx.com','gmx.co.uk','btinternet.com'
  ]);
$$;

create or replace function public.qiblah_mosque_trusted_domains(p_mosque public.mosques)
returns text[]
language sql
stable
as $$
  select array_remove(array[
    public.qiblah_claim_email_domain(p_mosque.email),
    public.qiblah_url_domain(p_mosque.website),
    public.qiblah_url_domain(p_mosque.url)
  ], null);
$$;

create or replace function public.qiblah_prepare_mosque_claim()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  mosque_row public.mosques;
  claim_domain text;
  trusted_domains text[];
begin
  new.email := lower(trim(new.email::text));
  new.claimant_name := nullif(trim(coalesce(new.claimant_name, '')), '');
  if new.claimant_name is null then
    raise exception 'Claimant name is required';
  end if;

  select * into mosque_row from public.mosques where id = new.mosque_id;
  if mosque_row.id is null then
    raise exception 'Mosque not found';
  end if;

  claim_domain := public.qiblah_claim_email_domain(new.email::text);
  trusted_domains := public.qiblah_mosque_trusted_domains(mosque_row);

  if claim_domain is not null
     and not public.qiblah_is_public_email_domain(claim_domain)
     and claim_domain = any(trusted_domains) then
    new.status := 'approved';
    new.approval_method := 'domain_match';
    new.reviewed_at := now();
  else
    new.status := 'pending';
    new.approval_method := null;
    new.reviewed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.qiblah_apply_approved_mosque_claim()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.status = 'approved' then
    insert into public.mosque_admin_members (mosque_id, user_id, email, role, status, approved_at)
    values (new.mosque_id, new.user_id, new.email, 'admin', 'active', coalesce(new.reviewed_at, now()))
    on conflict (mosque_id, user_id)
    do update set
      email = excluded.email,
      role = excluded.role,
      status = 'active',
      approved_at = excluded.approved_at;
  end if;
  return new;
end;
$$;

drop trigger if exists qiblah_prepare_mosque_claim_trigger on public.mosque_claims;
create trigger qiblah_prepare_mosque_claim_trigger
before insert on public.mosque_claims
for each row execute function public.qiblah_prepare_mosque_claim();

drop trigger if exists qiblah_apply_approved_mosque_claim_trigger on public.mosque_claims;
create trigger qiblah_apply_approved_mosque_claim_trigger
after insert or update of status on public.mosque_claims
for each row execute function public.qiblah_apply_approved_mosque_claim();

create or replace function public.approve_mosque_claim(p_claim_id uuid, p_role text default 'admin')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_role not in ('owner', 'admin', 'editor') then
    raise exception 'Invalid role';
  end if;

  update public.mosque_claims
  set status = 'approved',
      approval_method = 'manual',
      reviewed_at = now(),
      updated_at = now()
  where id = p_claim_id;

  update public.mosque_admin_members mam
  set role = p_role
  from public.mosque_claims mc
  where mc.id = p_claim_id
    and mam.mosque_id = mc.mosque_id
    and mam.user_id = mc.user_id;
end;
$$;

create or replace function public.reject_mosque_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.mosque_claims
  set status = 'rejected',
      approval_method = 'manual',
      reviewed_at = now(),
      updated_at = now()
  where id = p_claim_id
    and status <> 'approved';
end;
$$;

revoke all on function public.approve_mosque_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.reject_mosque_claim(uuid) from public, anon, authenticated;
revoke all on function public.qiblah_prepare_mosque_claim() from public, anon, authenticated;
revoke all on function public.qiblah_apply_approved_mosque_claim() from public, anon, authenticated;
grant execute on function public.approve_mosque_claim(uuid, text) to service_role;
grant execute on function public.reject_mosque_claim(uuid) to service_role;
