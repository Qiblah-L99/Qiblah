begin;

with today_ids as (
  select distinct mosque_id
  from prayer_timetables
  where date = date '2026-10-03'
    and (
      nullif(fajr_begins, '') is not null or nullif(fajr_jamaah, '') is not null or
      nullif(zuhr_begins, '') is not null or nullif(zuhr_jamaah, '') is not null or
      nullif(asr_begins, '') is not null or nullif(asr_jamaah, '') is not null or
      nullif(maghrib_begins, '') is not null or nullif(maghrib_jamaah, '') is not null or
      nullif(isha_begins, '') is not null or nullif(isha_jamaah, '') is not null
    )
  union
  select distinct mosque_id
  from announcements
  where active is true
    and title = 'Prayer Time 2026-10-03'
    and (tag = 'PrayerTime' or category = 'PrayerTime')
),
keep_ids as (
  select id
  from mosques
  where (borough = 'Tower Hamlets' and id in (select mosque_id from today_ids))
     or id = 'b2a2cf76-a4e8-4810-8d21-451e3ec51f8a'
)
update mosques m
set is_hidden = not exists (
  select 1
  from keep_ids k
  where k.id = m.id
);

select
  count(*) filter (where is_hidden is false) as visible_mosques,
  count(*) filter (where is_hidden is true) as hidden_mosques,
  bool_or(id = 'b2a2cf76-a4e8-4810-8d21-451e3ec51f8a' and is_hidden is false) as al_noor_barking_visible
from mosques;

commit;
