-- The Explorer's study room: documents the church owns, on its own database.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR: "I want Affine to be the special room for the Explorer right now:
-- Making it more like a real study room for them to use."
--
-- WHY THIS TABLE EXISTS AT ALL, which is the part worth reading. AFFiNE's
-- editor -- BlockSuite -- is MIT and embeddable. Its SERVER is not: everything
-- under packages/backend is licensed under the AFFiNE Enterprise Edition
-- licence, which permits production use only under their paid subscription
-- terms. So the editor can come in; the place it keeps documents cannot.
--
-- And the published BlockSuite packages do not fill that gap. `Workspace` is an
-- interface, and the only class implementing it in the published tree is
-- `TestWorkspace`, a test harness. AFFiNE's real workspace lives in frontend
-- packages they do not publish and syncs through the licensed backend.
--
-- So the store is ours, and this is it. That is not a workaround -- it is the
-- outcome the church wanted anyway: an Explorer's study notes live in the
-- church's own database, under the church's own rules, and leave for nobody.
--
-- WHY TEXT AND NOT bytea. A Yjs document is binary. Postgres would hold it more
-- compactly as bytea, but supabase-js hands bytea back as a `\x...` hex string
-- and every consumer then has to remember to decode it. A column that is
-- base64 text costs about a third more space and cannot be read wrongly. At the
-- size of a person's study notes that trade is not close.
--
-- WHO MAY READ IT: the person whose room it is, and nobody else. Not their
-- Guide, not a Director. This is deliberate and it follows the ruling made
-- about reading: a Guide may see THAT their Explorer has been working and when,
-- and never what they wrote. `updated_at` carries that signal; the document
-- itself never leaves its owner.
-- ---------------------------------------------------------------------------

create table if not exists public.study_docs (
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  -- The workspace and the document inside it. A workspace has one root doc
  -- holding the list and the titles, plus one doc per page; both live here, so
  -- doc_id is whatever BlockSuite calls them and this table does not care.
  workspace_id text not null,
  doc_id       text not null,
  -- Y.encodeStateAsUpdate(doc), base64. The whole state, not a log of changes:
  -- study notes are small, and a snapshot needs no compaction job to stop an
  -- append-only log growing without limit on a free-tier database.
  state        text not null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  primary key (owner_id, workspace_id, doc_id),

  -- A CEILING, BECAUSE THE FREE TIER IS 500 MB FOR THE WHOLE CHURCH. Roughly
  -- 1.5 MB of document per page once base64 is taken off. A study that cannot
  -- be saved is a bad day; a database that fills up is a bad month, and the
  -- second one takes the whole congregation down rather than one page.
  constraint study_docs_state_fits check (length(state) <= 2000000)
);

alter table public.study_docs enable row level security;

-- ONE POLICY PER VERB, each naming `authenticated`. A policy with no TO clause
-- applies to every role Postgres has, including the anonymous one Supabase
-- grants to the whole internet.
--
-- EACH IS DROPPED FIRST so the file can be applied twice. `create policy` has
-- no IF NOT EXISTS, so a migration that only creates fails the second time it
-- runs -- which is every time somebody rebuilds a database from the folder.
drop policy if exists study_docs_read on public.study_docs;
create policy study_docs_read on public.study_docs
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists study_docs_write on public.study_docs;
create policy study_docs_write on public.study_docs
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists study_docs_edit on public.study_docs;
create policy study_docs_edit on public.study_docs
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists study_docs_drop on public.study_docs;
create policy study_docs_drop on public.study_docs
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Loading a room reads every doc in one workspace, which is the only query this
-- table serves often enough to index for.
create index if not exists study_docs_by_workspace
  on public.study_docs (owner_id, workspace_id);

/**
 * When this person last worked in their study room, and how much is in it.
 *
 * THE ONLY THING ANYBODY ELSE MAY LEARN. Returns a time and two counts, never
 * a document, so a Guide can see that their Explorer has been working without
 * seeing a word of it. The ruling was: "Guide sees that something was read, not
 * what" -- writing is held to the same line.
 */
create or replace function public.study_room_pulse(p_person uuid)
returns table (last_worked_at timestamptz, pages bigint, bytes bigint)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare
  me public.profiles%rowtype;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me.id is null or not me.is_approved then return; end if;

  -- Themselves always; their Guide or Explorer through an active pairing; and
  -- leadership of the same church. Anybody else gets no row, which reads on a
  -- screen as "nothing to show" rather than as a refusal.
  if not (
    me.id = p_person
    or exists (select 1 from public.pairings pr
                where pr.status = 'active'
                  and ((pr.dm_id = me.id and pr.ds_id = p_person)
                    or (pr.ds_id = me.id and pr.dm_id = p_person)))
    or (me.role in ('admin', 'executive')
        and exists (select 1 from public.profiles p
                     where p.id = p_person and p.church_id = me.church_id))
  ) then
    return;
  end if;

  return query
    select max(d.updated_at), count(*)::bigint, coalesce(sum(length(d.state)), 0)::bigint
      from public.study_docs d
     where d.owner_id = p_person;
end;
$$;

revoke all on function public.study_room_pulse(uuid) from public, anon;
grant execute on function public.study_room_pulse(uuid) to authenticated;
