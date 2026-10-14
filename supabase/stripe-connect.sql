-- Stripe Connect support for Qiblah mosque donations.
-- Run this in the Supabase SQL Editor before enabling the Vercel API routes.
-- Stripe secret keys and webhook secrets must stay in Vercel environment variables.

create extension if not exists pgcrypto;

create table if not exists public.mosque_stripe_accounts (
  id uuid primary key default gen_random_uuid(),
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  stripe_account_id text not null unique,
  livemode boolean not null default false,
  dashboard text not null default 'full',
  fees_collector text not null default 'stripe',
  losses_collector text not null default 'stripe',
  card_payments_status text not null default 'unknown',
  onboarding_complete boolean not null default false,
  onboarding_url text,
  onboarding_url_expires_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mosque_stripe_accounts_mosque_unique unique (mosque_id),
  constraint mosque_stripe_accounts_dashboard_check check (dashboard in ('full', 'express', 'none')),
  constraint mosque_stripe_accounts_fees_check check (fees_collector in ('stripe', 'application')),
  constraint mosque_stripe_accounts_losses_check check (losses_collector in ('stripe', 'application'))
);

create table if not exists public.donation_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_account_id text not null,
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  amount integer not null check (amount > 0),
  currency text not null default 'gbp',
  payment_intent_id text,
  payment_status text not null default 'unpaid',
  checkout_status text not null default 'open',
  donor_email text,
  raw_session jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  stripe_account_id text,
  livemode boolean not null default false,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mosque_stripe_accounts_mosque_idx on public.mosque_stripe_accounts(mosque_id);
create index if not exists donation_checkout_sessions_mosque_idx on public.donation_checkout_sessions(mosque_id, created_at desc);
create index if not exists donation_checkout_sessions_account_idx on public.donation_checkout_sessions(stripe_account_id, created_at desc);
create index if not exists stripe_events_type_idx on public.stripe_events(type, created_at desc);

alter table public.mosque_stripe_accounts enable row level security;
alter table public.donation_checkout_sessions enable row level security;
alter table public.stripe_events enable row level security;

grant select on table public.mosque_stripe_accounts to authenticated;
grant select on table public.donation_checkout_sessions to authenticated;

drop policy if exists "Mosque members can read own Stripe account" on public.mosque_stripe_accounts;
create policy "Mosque members can read own Stripe account"
on public.mosque_stripe_accounts
for select
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = mosque_stripe_accounts.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);

drop policy if exists "Mosque members can read own donation sessions" on public.donation_checkout_sessions;
create policy "Mosque members can read own donation sessions"
on public.donation_checkout_sessions
for select
to authenticated
using (
  exists (
    select 1 from public.mosque_admin_members mam
    where mam.mosque_id = donation_checkout_sessions.mosque_id
      and mam.user_id = (select auth.uid())
      and mam.status = 'active'
  )
);
