-- A hub is kept running by its members' gifts.
--
-- ---------------------------------------------------------------------------
-- WHY. Each church runs its own copy of Hope Beacon, and the owner chose
-- Supabase Pro as the standard: $25 a month plus 12% GST, about 1,710 pesos.
-- Asked for on 26 October 2026: "There must be some kind of donation system
-- to maintain the standard maintenance of the app ... Can we make a plan and
-- system of it?" The owner's choices, asked before anything was built:
--
--   * gifts go to EACH CHURCH'S OWN TREASURY, as any offering does, and the
--     church pays its own bill;
--   * members give through the church's own GCash or bank account; NOTHING
--     IS PAID INSIDE THE APP, so the app holds no card and moves no money;
--   * members see the MONTH'S GOAL AND TOTAL, AND NO NAMES; each gift is
--     seen by the treasurer alone.
--
-- WHAT THIS ADDS (tables locked; every action goes through a function below
-- that checks who is asking):
--
--   hub_giving      one row per church: the monthly goal, one line on what it
--                   pays for, and how to give (GCash, bank, the GCash QR as a
--                   small picture). Set by the church's Directors.
--   hub_treasurers  who records gifts, named by a Director.
--   hub_gifts       each gift: an amount, the day it came, how it came and an
--                   optional note (a GCash reference). NO GIVER IS STORED:
--                   receipts and names stay in the church's own books.
--
-- A MONTH is a calendar month in Philippine time (Asia/Manila), the time the
-- treasurer's own books keep. A church elsewhere changes private.hub_today().
-- ---------------------------------------------------------------------------

begin;

-- ------------------------------------------------------------- tables ----

create table if not exists public.hub_giving (
  church_id           uuid primary key references public.churches (id) on delete cascade,
  currency            text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  monthly_goal        numeric(12, 2) not null default 1710
                      check (monthly_goal > 0 and monthly_goal <= 10000000),
  purpose             text not null
                      default 'Our Hope Beacon app: the database it runs on, its backups and its email.'
                      check (length(btrim(purpose)) between 1 and 200),
  gcash_name          text check (gcash_name is null or length(btrim(gcash_name)) between 1 and 80),
  gcash_number        text check (gcash_number is null or gcash_number ~ '^\+?[0-9][0-9 -]{5,18}[0-9]$'),
  bank_name           text check (bank_name is null or length(btrim(bank_name)) between 1 and 80),
  bank_account_name   text check (bank_account_name is null or length(btrim(bank_account_name)) between 1 and 80),
  bank_account_number text check (bank_account_number is null or bank_account_number ~ '^[0-9A-Za-z][0-9A-Za-z -]{2,32}[0-9A-Za-z]$'),
  -- The GCash QR code, as a small picture the app has already shrunk. Kept in
  -- the row rather than in file storage: one picture per church, nothing to
  -- erase separately, and the page's rules already allow data: pictures.
  qr_image            text check (qr_image is null or (length(qr_image) <= 400000
                        and qr_image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now()
);

create table if not exists public.hub_treasurers (
  church_id uuid not null references public.churches (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete cascade,
  named_by  uuid references public.profiles (id) on delete set null,
  named_at  timestamptz not null default now(),
  primary key (church_id, person_id)
);

create table if not exists public.hub_gifts (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  received_on date not null,
  method      text not null check (method in ('gcash', 'maya', 'bank', 'cash', 'other')),
  note        text check (note is null or length(note) <= 120),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists hub_gifts_by_church_day on public.hub_gifts (church_id, received_on);

alter table public.hub_giving     enable row level security;
alter table public.hub_treasurers enable row level security;
alter table public.hub_gifts      enable row level security;
-- No policies on purpose: with RLS on and every grant revoked, the functions
-- below are the only way in.
revoke all on public.hub_giving, public.hub_treasurers, public.hub_gifts from public, anon, authenticated;

-- ------------------------------------------------------------ helpers ----

/** Today, as the treasurer's books count it. */
create or replace function private.hub_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Manila')::date $$;

/** The caller's church, when they are an approved, unsuspended member of one. */
create or replace function private.hub_my_church()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.church_id
    from public.profiles p
   where p.id = (select auth.uid())
     and p.is_approved
     and p.suspended_at is null
     and p.church_id is not null;
$$;

/** Whether the caller is a Director (or senior leader) of their own church. */
create or replace function private.hub_i_lead()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.is_approved
       and p.suspended_at is null
       and p.church_id is not null
       and p.role in ('admin', 'executive'));
$$;

/**
 * Whether the caller records gifts for their own church: named by a Director,
 * and still an approved, unsuspended member of that same church.
 */
create or replace function private.hub_i_keep_the_books()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.hub_treasurers t
      join public.profiles p on p.id = t.person_id
     where t.person_id = (select auth.uid())
       and t.church_id = p.church_id
       and p.is_approved
       and p.suspended_at is null);
$$;

/** The total given to a church in one calendar month. */
create or replace function private.hub_month_total(p_church uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(g.amount), 0)
    from public.hub_gifts g
   where g.church_id = p_church
     and g.received_on >= date_trunc('month', p_month)::date
     and g.received_on <  (date_trunc('month', p_month) + interval '1 month')::date;
$$;

-- ----------------------------------------------------- what members see ----

/**
 * The card everybody in a church sees: the month's goal and total, and how to
 * give. Never who gave. Null when the church has not set giving up yet.
 * `i_lead` and `i_keep_the_books` say which folders the screen offers.
 */
create or replace function public.hub_giving_card()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c     uuid := private.hub_my_church();
  g     public.hub_giving%rowtype;
  today date := private.hub_today();
begin
  if c is null then
    raise exception 'Only an approved member of a church can see its giving.' using errcode = '42501';
  end if;
  select * into g from public.hub_giving where church_id = c;
  if g.church_id is null then
    return jsonb_build_object('set_up', false,
                              'i_lead', private.hub_i_lead(),
                              'i_keep_the_books', private.hub_i_keep_the_books());
  end if;
  return jsonb_build_object(
    'set_up',              true,
    'currency',            g.currency,
    'monthly_goal',        g.monthly_goal,
    'purpose',             g.purpose,
    'gcash_name',          g.gcash_name,
    'gcash_number',        g.gcash_number,
    'bank_name',           g.bank_name,
    'bank_account_name',   g.bank_account_name,
    'bank_account_number', g.bank_account_number,
    'qr_image',            g.qr_image,
    'month',               to_char(today, 'YYYY-MM'),
    'given_this_month',    private.hub_month_total(c, today),
    'given_last_month',    private.hub_month_total(c, (date_trunc('month', today) - interval '1 day')::date),
    'i_lead',              private.hub_i_lead(),
    'i_keep_the_books',    private.hub_i_keep_the_books());
end;
$$;

-- ---------------------------------------------------- what Directors do ----

/** Set the goal, what it pays for, and how to give. Directors only. */
create or replace function public.hub_giving_save(
  p_currency            text,
  p_monthly_goal        numeric,
  p_purpose             text,
  p_gcash_name          text,
  p_gcash_number        text,
  p_bank_name           text,
  p_bank_account_name   text,
  p_bank_account_number text,
  p_qr_image            text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c uuid := private.hub_my_church();
  clean_gcash text := nullif(btrim(coalesce(p_gcash_number, '')), '');
  clean_bank  text := nullif(btrim(coalesce(p_bank_account_number, '')), '');
begin
  if c is null or not private.hub_i_lead() then
    raise exception 'Only a Director can change how the church receives gifts.' using errcode = '42501';
  end if;
  if clean_gcash is null and clean_bank is null then
    raise exception 'Give a GCash number or a bank account, so members know where to give.' using errcode = '22023';
  end if;
  insert into public.hub_giving as h (
    church_id, currency, monthly_goal, purpose, gcash_name, gcash_number,
    bank_name, bank_account_name, bank_account_number, qr_image, updated_by, updated_at)
  values (
    c,
    upper(btrim(coalesce(nullif(p_currency, ''), 'PHP'))),
    p_monthly_goal,
    btrim(coalesce(nullif(btrim(p_purpose), ''),
                   'Our Hope Beacon app: the database it runs on, its backups and its email.')),
    nullif(btrim(coalesce(p_gcash_name, '')), ''),
    clean_gcash,
    nullif(btrim(coalesce(p_bank_name, '')), ''),
    nullif(btrim(coalesce(p_bank_account_name, '')), ''),
    clean_bank,
    nullif(p_qr_image, ''),
    (select auth.uid()),
    now())
  on conflict (church_id) do update set
    currency = excluded.currency, monthly_goal = excluded.monthly_goal,
    purpose = excluded.purpose, gcash_name = excluded.gcash_name,
    gcash_number = excluded.gcash_number, bank_name = excluded.bank_name,
    bank_account_name = excluded.bank_account_name,
    bank_account_number = excluded.bank_account_number,
    qr_image = excluded.qr_image, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

/**
 * Who keeps the books, and who could: the church's treasurers, and for a
 * Director the approved members who could be named. Directors and treasurers.
 */
create or replace function public.hub_treasurers_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c    uuid := private.hub_my_church();
  lead boolean := private.hub_i_lead();
begin
  if c is null or not (lead or private.hub_i_keep_the_books()) then
    raise exception 'Only a Director or a treasurer can see who keeps the books.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'treasurers', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, ''), 'role', p.role)
                       order by p.full_name)
        from public.hub_treasurers t
        join public.profiles p on p.id = t.person_id
       where t.church_id = c and p.church_id = c), '[]'::jsonb),
    'candidates', case when lead then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, ''), 'role', p.role)
                       order by p.full_name)
        from public.profiles p
       where p.church_id = c and p.is_approved and p.suspended_at is null
         and not exists (select 1 from public.hub_treasurers t
                          where t.church_id = c and t.person_id = p.id)), '[]'::jsonb)
      else '[]'::jsonb end);
end;
$$;

/** Name somebody in the church as a treasurer. Directors only. */
create or replace function public.hub_treasurer_name(p_person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c uuid := private.hub_my_church();
begin
  if c is null or not private.hub_i_lead() then
    raise exception 'Only a Director can name a treasurer.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_person and p.church_id = c
                    and p.is_approved and p.suspended_at is null) then
    raise exception 'A treasurer must be an approved member of this church.' using errcode = '22023';
  end if;
  insert into public.hub_treasurers (church_id, person_id, named_by)
  values (c, p_person, (select auth.uid()))
  on conflict (church_id, person_id) do nothing;
end;
$$;

/** Stop somebody keeping the books. Directors only. Their gifts stay recorded. */
create or replace function public.hub_treasurer_remove(p_person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c uuid := private.hub_my_church();
begin
  if c is null or not private.hub_i_lead() then
    raise exception 'Only a Director can change who keeps the books.' using errcode = '42501';
  end if;
  delete from public.hub_treasurers where church_id = c and person_id = p_person;
end;
$$;

-- ---------------------------------------------------- what treasurers do ----

/** Record a gift that reached the church's treasury. Treasurers only. */
create or replace function public.hub_gift_record(
  p_amount      numeric,
  p_received_on date,
  p_method      text,
  p_note        text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c     uuid := private.hub_my_church();
  today date := private.hub_today();
  made  uuid;
begin
  if c is null or not private.hub_i_keep_the_books() then
    raise exception 'Only a treasurer can record gifts.' using errcode = '42501';
  end if;
  if p_received_on is null or p_received_on > today then
    raise exception 'A gift is recorded on the day it came, which cannot be in the future.' using errcode = '22023';
  end if;
  if p_received_on < today - 400 then
    raise exception 'That date is more than a year ago. Record it in the church''s own books.' using errcode = '22023';
  end if;
  insert into public.hub_gifts (church_id, amount, received_on, method, note, recorded_by)
  values (c, round(p_amount, 2), p_received_on, p_method,
          nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()))
  returning id into made;
  return made;
end;
$$;

/** Take back a gift recorded by mistake. Treasurers only, in their own church. */
create or replace function public.hub_gift_remove(p_gift uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c uuid := private.hub_my_church();
begin
  if c is null or not private.hub_i_keep_the_books() then
    raise exception 'Only a treasurer can take back a gift.' using errcode = '42501';
  end if;
  delete from public.hub_gifts where id = p_gift and church_id = c;
  if not found then
    raise exception 'That gift is not recorded for this church.' using errcode = '22023';
  end if;
end;
$$;

/** The gifts of one month ('YYYY-MM', or this month). Treasurers only. */
create or replace function public.hub_gifts_list(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c     uuid := private.hub_my_church();
  first date;
begin
  if c is null or not private.hub_i_keep_the_books() then
    raise exception 'Only a treasurer can see each gift.' using errcode = '42501';
  end if;
  if coalesce(p_month, '') ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    first := to_date(p_month || '-01', 'YYYY-MM-DD');
  else
    first := date_trunc('month', private.hub_today())::date;
  end if;
  return jsonb_build_object(
    'month', to_char(first, 'YYYY-MM'),
    'total', private.hub_month_total(c, first),
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'amount', g.amount, 'received_on', g.received_on,
               'method', g.method, 'note', g.note,
               'recorded_by', coalesce(p.full_name, ''))
             order by g.received_on desc, g.recorded_at desc)
        from public.hub_gifts g
        left join public.profiles p on p.id = g.recorded_by
       where g.church_id = c
         and g.received_on >= first
         and g.received_on < (first + interval '1 month')::date), '[]'::jsonb));
end;
$$;

-- -------------------------------------------------------------- grants ----

revoke all on function private.hub_today()                        from public, anon, authenticated;
revoke all on function private.hub_my_church()                    from public, anon, authenticated;
revoke all on function private.hub_i_lead()                       from public, anon, authenticated;
revoke all on function private.hub_i_keep_the_books()             from public, anon, authenticated;
revoke all on function private.hub_month_total(uuid, date)        from public, anon, authenticated;

revoke all on function public.hub_giving_card()                   from public, anon;
revoke all on function public.hub_giving_save(text, numeric, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.hub_treasurers_list()               from public, anon;
revoke all on function public.hub_treasurer_name(uuid)            from public, anon;
revoke all on function public.hub_treasurer_remove(uuid)          from public, anon;
revoke all on function public.hub_gift_record(numeric, date, text, text) from public, anon;
revoke all on function public.hub_gift_remove(uuid)               from public, anon;
revoke all on function public.hub_gifts_list(text)                from public, anon;

grant execute on function public.hub_giving_card()                to authenticated;
grant execute on function public.hub_giving_save(text, numeric, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.hub_treasurers_list()            to authenticated;
grant execute on function public.hub_treasurer_name(uuid)         to authenticated;
grant execute on function public.hub_treasurer_remove(uuid)       to authenticated;
grant execute on function public.hub_gift_record(numeric, date, text, text) to authenticated;
grant execute on function public.hub_gift_remove(uuid)            to authenticated;
grant execute on function public.hub_gifts_list(text)             to authenticated;

commit;
