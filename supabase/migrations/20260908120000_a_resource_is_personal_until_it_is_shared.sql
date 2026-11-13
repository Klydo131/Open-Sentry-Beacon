-- A resource is yours until you hand it to somebody.
--
-- ---------------------------------------------------------------------------
-- THE RULE: a resource is not a group study for other Guides and Explorers.
-- When a Guide has several Explorers, a share is private to the Explorers it
-- was given to.
--
-- HALF OF THAT WAS ALREADY TRUE, and it is worth saying which half before
-- changing anything. `shares_read` is `in_pairing(pairing_id)`, so a share into
-- one pairing is invisible to every other pairing: a Guide walking with five
-- people hands something to one of them and the other four cannot see it.
-- Explorers also never had the church-wide arm of `can_read_material`, which is
-- gated on `auth_role() in ('dm','admin','executive')`. So nothing ever leaked
-- between Explorers.
--
-- WHAT DID LEAK: every Guide and every Director could read every resource in
-- the church, including another Guide's private bookmark and an Explorer's own
-- addition. Not because anybody chose it. `materials.is_published` DEFAULTS TO
-- TRUE and no screen in this app has ever set it -- there is no publish control
-- for resources anywhere. So "published to the whole church" has meant, in
-- practice, "exists". The column was designed for a decision nobody was ever
-- asked to make.
--
-- Measured before writing this: twelve resources, all twelve published, eleven
-- of them also shared into a pairing. So the pool was almost entirely things
-- that were meant for somebody specific anyway.
--
-- THE CHANGE IS ONE DEFAULT AND ONE GUARD.
--
--   The default becomes false. A new resource is yours, plus whoever you hand
--   it to, and nobody else.
--
--   Publishing becomes leadership's act, enforced here rather than on a screen.
--   Without the guard the default is a suggestion: `materials_edit` already
--   lets the person who added a row update it, so anybody could set the flag
--   back to true on their own row and reach the whole church by another route.
--
-- NOTHING IS REWRITTEN. The twelve rows already on the church shelf stay there,
-- by the owner's decision: nothing anybody can see today disappears. This
-- migration writes no rows at all.
-- ---------------------------------------------------------------------------

begin;

-- 1. PRIVATE BY DEFAULT.
alter table public.materials alter column is_published set default false;

-- 2. AND NOT PUBLISHABLE ON THE WAY IN, EITHER. An insert naming
--    is_published = true would otherwise walk straight past the default.
drop policy if exists materials_create on public.materials;

create policy materials_create on public.materials
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and church_id = public.my_church_id()
    and public.auth_role() in ('dm', 'ds', 'admin', 'executive')
    and not public.library_blocked((select auth.uid()))
    -- Putting something in front of the whole church is leadership's call.
    and (is_published = false or public.manages_church(church_id))
  );

-- 3. THE GUARD ON THE WAY UP.
--
-- `materials_edit` lets whoever added a row update it, which is right for a
-- title and a link and wrong for this flag. A policy cannot see the OLD row, so
-- the rule that only a promotion is refused belongs in a trigger. Taking
-- something back OFF the shelf stays open to whoever may edit the row: undoing
-- exposure needs no permission.
create or replace function private.only_leadership_publishes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.is_published and not coalesce(old.is_published, false)
     and not public.manages_church(new.church_id) then
    raise exception 'Only a Director can put a resource on the church shelf.';
  end if;
  return new;
end;
$$;

revoke all on function private.only_leadership_publishes() from public, anon, authenticated;

drop trigger if exists materials_publishing_is_leaderships on public.materials;
create trigger materials_publishing_is_leaderships
  before update of is_published on public.materials
  for each row execute function private.only_leadership_publishes();

commit;
