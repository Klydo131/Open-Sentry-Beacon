-- A changed address is judged again.
--
-- The activity record judges an address when a resource is added, when it is
-- shared, and when a web app goes into a pocket
-- (20260917140000_leadership_sees_the_shape_not_the_thing). An address may
-- also be changed afterwards, and the record must describe what a person has
-- now, not only what they were first given.

begin;

-- shortcut: no new kind of line. A changed address is recorded as the same
-- 'shared' (to each person who already has it) or 'added' (nobody has it yet)
-- that the record, its alert and its screens already understand.
create or replace function private.record_library_address_change()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $function$
declare
  -- A Director may correct somebody else's resource; the line names whoever
  -- made the change. With no signed-in user it is the church's operator.
  who uuid := coalesce((select auth.uid()), new.added_by);
  has_it record;
  told boolean := false;
begin
  for has_it in
    select coalesce(nullif(btrim(other.full_name), ''), 'the other person') as name
      from public.material_shares s
      join public.pairings p on p.id = s.pairing_id
      left join public.profiles other
        on other.id = case when p.dm_id = s.shared_by then p.ds_id else p.dm_id end
     where s.material_id = new.id
  loop
    perform private.record_activity(who, 'shared', 'library', new.title, new.external_url, has_it.name, now());
    told := true;
  end loop;
  if not told then
    perform private.record_activity(who, 'added', 'library', new.title, new.external_url, null, now());
  end if;
  return new;
end;
$function$;

revoke all on function private.record_library_address_change() from public, anon, authenticated;

drop trigger if exists materials_address_change_is_recorded on public.materials;
create trigger materials_address_change_is_recorded
  after update of external_url on public.materials
  for each row
  when (new.external_url is distinct from old.external_url)
  execute function private.record_library_address_change();

create or replace function private.record_pocket_address_change()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $function$
begin
  perform private.record_activity(
    new.owner_id, 'pocketed', 'pocket',
    coalesce(nullif(btrim(new.label), ''), 'A web app'), new.url, null, now());
  return new;
end;
$function$;

revoke all on function private.record_pocket_address_change() from public, anon, authenticated;

drop trigger if exists pocket_apps_address_change_is_recorded on public.pocket_apps;
create trigger pocket_apps_address_change_is_recorded
  after update of url on public.pocket_apps
  for each row
  when (new.url is distinct from old.url)
  execute function private.record_pocket_address_change();

commit;
