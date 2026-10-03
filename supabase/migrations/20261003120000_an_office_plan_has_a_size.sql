-- An office plan has a size, and only an approved member keeps one.
--
-- ---------------------------------------------------------------------------
-- FOUND BY THE AUDIT OF 3 OCTOBER 2026. 20261002150000_office_plans_follow_you
-- let one account keep 1,000 plans of up to 400 KB each: about 400 MB, close
-- to everything a free Supabase project holds. One account could have filled
-- the church's database and made it read-only for everybody. And its rules
-- asked only "is this row yours?", not "are you an approved member?".
--
-- WHY A NEW FILE AND NOT AN EDIT. That migration had not reached the live
-- database when this was found, but nobody could check from here whether it
-- had been pasted in since, so it stays exactly as it is and this one runs
-- after it. Run on a database that already has it, this tightens it; run
-- fresh, the two together are the table as it should be.
--
-- THE LIMITS, measured rather than guessed. A believable evangelistic series
-- (31 nights, three rosters of forty, three pages of notes, two checklists) is
-- about 55 KB. The Office keeps at most 120 programs and 60 series on a device
-- (lib/sabbath-program.ts, lib/evangelistic-meeting.ts).
--
--   * one plan: 200 KB of stored text, about four times that series;
--   * 200 live plans, above the 180 a device can hold;
--   * 1,000 rows in all, counting deletions remembered as marks;
--   * 10 MB for one account, all plans together;
--   * a deletion mark carries no body.
--
-- The browser keeps a plan over the first limit on the device instead of
-- sending it (lib/live/office-plans.ts), so one oversized plan cannot hold back
-- the rest. supabase/tests/an-office-plan-has-a-size.sql proves each limit as
-- invented people.
-- ---------------------------------------------------------------------------

begin;

-- One plan: 200 KB. NOT VALID so a row already larger, if any, is kept; every
-- new or changed row is held to it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.office_plans'::regclass and conname = 'office_plans_body_fits'
  ) then
    alter table public.office_plans
      add constraint office_plans_body_fits
      check (octet_length(body::text) <= 200000) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.office_plans'::regclass and conname = 'office_plans_deleted_is_empty'
  ) then
    alter table public.office_plans
      add constraint office_plans_deleted_is_empty
      check (not deleted or body = '{}'::jsonb) not valid;
  end if;
end $$;

-- Who may keep plans, and how much. Replaces the first version, which counted
-- rows on insert only: a row added small and then changed to a large one
-- passed it.
create or replace function private.office_plans_are_not_overflowing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_plans integer;
  all_rows   integer;
  kept_bytes bigint;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = new.owner_id and p.is_approved
  ) then
    raise exception 'Only an approved member keeps programs and meetings in the account.'
      using errcode = '42501';
  end if;

  -- One account's writes take turns, so two at once cannot both squeeze under
  -- a limit that only one of them fits.
  perform pg_advisory_xact_lock(hashtextextended('office_plans:' || new.owner_id::text, 0));

  select count(*) filter (where not o.deleted),
         count(*),
         coalesce(sum(pg_column_size(o.body)), 0)
    into live_plans, all_rows, kept_bytes
    from public.office_plans o
   where o.owner_id = new.owner_id
     and o.id <> new.id;

  if not new.deleted and live_plans >= 200 then
    raise exception 'This account keeps 200 programs and meetings. Delete old ones to add more.'
      using errcode = '54000';
  end if;
  if all_rows >= 1000 then
    raise exception 'This account keeps 1000 programs and meetings. Delete old ones to add more.'
      using errcode = '54000';
  end if;
  if kept_bytes + pg_column_size(new.body) > 10000000 then
    raise exception 'This account''s programs and meetings have reached 10 MB. Delete old ones to add more.'
      using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function private.office_plans_are_not_overflowing() from public, anon, authenticated;

-- On every write now, not only the first.
drop trigger if exists office_plans_cap on public.office_plans;
create trigger office_plans_cap
  before insert or update on public.office_plans
  for each row execute function private.office_plans_are_not_overflowing();

commit;
