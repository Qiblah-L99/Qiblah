-- Apply after stripe-connect.sql with explicit approval of the target database.
-- Shared databases are supported only while server payments stay demo-only and test-mode.
-- This fixture is hidden from public mosque listings and contains no real mosque data.
begin;

insert into public.mosques (id, name, slug, address, area, website, is_hidden)
values (
  '49a8bf95-1f45-4c99-9af7-030f00214d0d',
  'Qiblah Demo Mosque',
  'qiblah-demo-mosque',
  'Demonstration profile - London, UK',
  'Demo',
  'https://qiblah.co.uk',
  true
)
on conflict (id) do nothing;

insert into public.mosque_stripe_accounts (mosque_id, stripe_account_id, livemode)
select id, 'acct_1UQOPY2X8d8Mch8O', false
from public.mosques
where id = '49a8bf95-1f45-4c99-9af7-030f00214d0d'
  and name = 'Qiblah Demo Mosque'
  and slug = 'qiblah-demo-mosque'
  and is_hidden = true
on conflict (mosque_id) do nothing;

commit;
