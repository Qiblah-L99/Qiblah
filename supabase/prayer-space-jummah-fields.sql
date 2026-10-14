-- Optional Friday sessions for existing prayer spaces. No records or access policies are changed.
alter table public.prayer_spaces
  add column if not exists jummah_times text[] not null default '{}',
  add column if not exists jummah_notes text;
