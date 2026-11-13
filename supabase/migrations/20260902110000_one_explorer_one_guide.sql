-- One Explorer, one Guide, enforced by the database itself.
--
-- The migration before this one could not do it. A partial unique index cannot
-- be built while rows already breach it, and four Explorers each had two active
-- Guides, so the rule went in as a trigger and the four were left for a person
-- to settle. They have now been settled: the pairing that carried the real
-- conversation was kept, and where neither did, the first one made.
--
-- So the rule can finally be what it should have been from the start. A trigger
-- is a rule the database follows; a unique index is a rule the database cannot
-- break, including under two writes arriving at the same instant, which is
-- exactly how a second Guide would appear if two Directors paired at once.
--
-- The trigger stays. It is what produces a sentence a Director can read
-- instead of a constraint name, and it fires first.
--
-- This index also subsumes pairings_active_pair_once: if an Explorer can have
-- only one active pairing at all, they certainly cannot have two with the same
-- Guide. Keeping both would be a second index earning nothing on every write.
drop index if exists public.pairings_active_pair_once;

create unique index if not exists pairings_one_active_guide
  on public.pairings (ds_id)
  where status = 'active';

comment on index public.pairings_one_active_guide is
  'An Explorer has one Guide. Archived pairings are exempt, so a pair can be disconnected and made again.';
