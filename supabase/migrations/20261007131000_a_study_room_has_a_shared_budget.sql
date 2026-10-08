-- One person's pages and pictures share one budget. Actual row changes charge
-- it transactionally, so parallel devices cannot spend the same space twice.
begin;

create table if not exists private.study_usage (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  used_bytes bigint not null check (used_bytes >= 0),
  entry_count bigint not null check (entry_count >= 0)
);
alter table private.study_usage enable row level security;
revoke all on private.study_usage from public, anon, authenticated;

-- Hold writes while counting existing rows and attaching their charge triggers.
-- Otherwise a save between the backfill and trigger creation is never charged.
lock table public.study_docs, public.study_blobs in share row exclusive mode;

insert into private.study_usage (owner_id, used_bytes, entry_count)
select owner_id, sum(size), count(*) from (
  select owner_id, octet_length(state)::bigint + octet_length(workspace_id) + octet_length(doc_id) as size
    from public.study_docs
  union all
  select owner_id, octet_length(bytes)::bigint + octet_length(workspace_id) + octet_length(key) + octet_length(mime)
    from public.study_blobs
) rows group by owner_id
on conflict (owner_id) do update
set used_bytes = excluded.used_bytes, entry_count = excluded.entry_count;

create or replace function private.charge_study_room()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  person uuid;
  old_size bigint := 0;
  new_size bigint := 0;
  row_delta integer := 0;
  totals private.study_usage%rowtype;
begin
  if tg_op <> 'DELETE' then
    person := new.owner_id;
    if (select auth.uid()) is not null and not public.is_approved_user() then
      raise exception 'Your account must be approved before saving a study room.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      if new.owner_id is distinct from old.owner_id or new.workspace_id is distinct from old.workspace_id
         or new.doc_id is distinct from old.doc_id then
        raise exception 'A study page keeps its owner and identity.' using errcode = '42501';
      end if;
    end if;
    if tg_op = 'INSERT' then
      if octet_length(new.workspace_id) > 512 then
        raise exception 'The study room identifier is too long.' using errcode = '22023';
      end if;
      if tg_table_name = 'study_docs' then
        if octet_length(new.doc_id) > 512 then
          raise exception 'The study page identifier is too long.' using errcode = '22023';
        end if;
      elsif octet_length(new.key) > 512 or octet_length(new.mime) > 128 then
        raise exception 'The study file identifier or type is too long.' using errcode = '22023';
      end if;
    end if;
    if tg_table_name = 'study_docs' then
      new_size := octet_length(new.state)::bigint + octet_length(new.workspace_id) + octet_length(new.doc_id);
    else
      new_size := octet_length(new.bytes)::bigint + octet_length(new.workspace_id) + octet_length(new.key) + octet_length(new.mime);
    end if;
  end if;
  if tg_op <> 'INSERT' then
    person := old.owner_id;
    if tg_table_name = 'study_docs' then
      old_size := octet_length(old.state)::bigint + octet_length(old.workspace_id) + octet_length(old.doc_id);
    else
      old_size := octet_length(old.bytes)::bigint + octet_length(old.workspace_id) + octet_length(old.key) + octet_length(old.mime);
    end if;
  end if;
  row_delta := case tg_op when 'INSERT' then 1 when 'DELETE' then -1 else 0 end;
  if tg_op = 'DELETE' then
    -- Profile deletion may already have cascaded through the counter. Never
    -- recreate it while that account and its pages are being removed.
    update private.study_usage set used_bytes = greatest(0, used_bytes - old_size),
      entry_count = greatest(0, entry_count - 1) where owner_id = person;
    return old;
  end if;
  insert into private.study_usage (owner_id, used_bytes, entry_count)
    values (person, greatest(0, new_size - old_size), greatest(0, row_delta))
  on conflict (owner_id) do update
    set used_bytes = private.study_usage.used_bytes + new_size - old_size,
        entry_count = private.study_usage.entry_count + row_delta
  returning * into totals;
  -- Existing larger rooms retain every page. Reading, deleting and shrinking
  -- still work; only growth stops until there is room again.
  if (new_size > old_size or row_delta > 0)
     and (totals.used_bytes > 20::bigint * 1024 * 1024 or totals.entry_count > 500) then
    raise exception 'Your study room is full. Export a copy and permanently delete unused pages. Contact your service for help if it stays full.'
      using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.charge_study_room() from public, anon, authenticated;
drop trigger if exists charge_study_room on public.study_docs;
create trigger charge_study_room after insert or update or delete on public.study_docs
for each row execute function private.charge_study_room();
drop trigger if exists charge_study_room on public.study_blobs;
create trigger charge_study_room after insert or delete on public.study_blobs
for each row execute function private.charge_study_room();

commit;
