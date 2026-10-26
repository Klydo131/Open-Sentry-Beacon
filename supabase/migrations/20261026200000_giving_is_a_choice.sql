-- Giving is a choice each church makes, and it starts switched off.
--
-- ---------------------------------------------------------------------------
-- WHY. 20261026120000_a_hub_is_kept_running_by_gifts gave every copy of Hope
-- Beacon a giving card the moment a Director set it up. The owner, the same
-- day: "Donation features are only optional if developers want to put it on
-- their own home brewed Hope Beacon." A church that pays for its hub another
-- way, or that would rather not ask its members for money inside the app,
-- should never see a Giving folder offered to it.
--
-- So giving now has the same kind of switch as the court room's email door:
-- one row in public.app_settings, which only the server can read or write
-- (0014_mail_settings_fallback):
--
--     HUB_GIVING = 'on'                      the giving card and folder appear
--     anything else, or no row at all        nothing about giving appears, and
--                                            every giving function refuses
--
-- Switch it on, as the owner of the project, in the SQL editor:
--
--     insert into public.app_settings (key, value) values ('HUB_GIVING', 'on')
--     on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- Delete the row to switch it off again. What was set up and recorded stays,
-- untouched, and returns when the switch does.
--
-- HOW, in two places only:
--   * private.hub_my_church() answers nobody while giving is off. Every
--     function that changes or lists anything starts by asking it, and already
--     refuses a caller with no church, so all of them refuse at once.
--   * public.hub_giving_card() says {"enabled": false} instead of refusing, so
--     the screens can tell "switched off" from "something went wrong" and
--     simply show nothing.
-- ---------------------------------------------------------------------------

begin;

/** Whether this project has switched giving on (HUB_GIVING = 'on'). */
create or replace function private.hub_giving_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(coalesce(
           (select s.value from public.app_settings s where s.key = 'HUB_GIVING'), '')))
         = 'on';
$$;

/**
 * The caller's church, when giving is switched on and they are an approved,
 * unsuspended member of one. Null otherwise, which every giving function
 * already treats as "not yours to do".
 */
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
     and p.church_id is not null
     and private.hub_giving_on();
$$;

/**
 * The card everybody in a church sees: the month's goal and total, and how to
 * give. Never who gave. {"enabled": false} when this project has not switched
 * giving on; {"set_up": false, ...} when it has but no Director has set it up.
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
  c     uuid;
  g     public.hub_giving%rowtype;
  today date := private.hub_today();
begin
  if not private.hub_giving_on() then
    return jsonb_build_object('enabled', false);
  end if;
  c := private.hub_my_church();
  if c is null then
    raise exception 'Only an approved member of a church can see its giving.' using errcode = '42501';
  end if;
  select * into g from public.hub_giving where church_id = c;
  if g.church_id is null then
    return jsonb_build_object('enabled', true,
                              'set_up', false,
                              'i_lead', private.hub_i_lead(),
                              'i_keep_the_books', private.hub_i_keep_the_books());
  end if;
  return jsonb_build_object(
    'enabled',             true,
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

revoke all on function private.hub_giving_on()  from public, anon, authenticated;
revoke all on function private.hub_my_church()  from public, anon, authenticated;
revoke all on function public.hub_giving_card() from public, anon;
grant execute on function public.hub_giving_card() to authenticated;

commit;
