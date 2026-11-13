-- What happened, kept in a form that survives the people leaving.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR IN THESE WORDS. and.
--
-- WHY A SEPARATE TABLE RATHER THAN TRUSTING THE ROWS THAT ARE ALREADY THERE.
-- Thirty-seven tables cascade off `profiles`. Deleting an account does not
-- leave its history behind; it takes the pairings, the prayer requests, the
-- materials, the lessons, the meetings and the journey events with it. So any
-- record meant to outlive an account cannot hold a foreign key to one, and this
-- table deliberately holds none.
--
-- WHAT MAY GO IN IT, AND WHAT MAY NOT. Counts, dates, stages, durations, roles.
-- No name, no e-mail, no phone number, no message body, no prayer text, no note
-- anybody wrote about anybody. A person appears as a hash of their id and
-- nothing else, which keeps two rows about the same person joinable without
-- keeping the person. Once the accounts are gone the hash points at nobody --
-- that is the point of it.
--
-- The rule is not enforceable in SQL, so it is written here where whoever adds
-- the next snapshot will read it, and the insert path is leadership's alone.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.activity_record (
  id         uuid primary key default gen_random_uuid(),
  taken_at   timestamptz not null default now(),
  -- NOT a foreign key to profiles, on purpose. See above.
  church_id  uuid references public.churches (id) on delete cascade,
  subject    text not null check (length(btrim(subject)) between 1 and 60),
  facts      jsonb not null
);

create index if not exists activity_record_subject_idx
  on public.activity_record (church_id, subject, taken_at desc);

alter table public.activity_record enable row level security;

drop policy if exists activity_record_read  on public.activity_record;
drop policy if exists activity_record_write on public.activity_record;

-- Leadership reads it. It is the church's own record of itself, and it says
-- nothing about any individual that a name could be attached to.
create policy activity_record_read on public.activity_record
  for select to authenticated using (public.manages_church(church_id));

create policy activity_record_write on public.activity_record
  for insert to authenticated with check (public.manages_church(church_id));

commit;
