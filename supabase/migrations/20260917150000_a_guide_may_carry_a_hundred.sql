-- A hundred, because the owner asked for a hundred.
--
-- ---------------------------------------------------------------------------
-- ASKED FOR.
--
-- WHAT IS BEING TRADED, SAID ONCE AND THEN NOT ARGUED. Five was never a
-- technical limit; it was a claim about how many people one person can actually
-- walk with, and the whole discipleship shape of this app was built on it. A
-- hundred is a different claim, and it is the church's to make rather than the
-- software's.
--
-- WHAT DOES NOT CHANGE, AND IS THE ONLY PART THAT EVER MATTERED: the number
-- stays ENFORCED rather than becoming advisory. The point of putting it in the
-- database was never the size of it. It is that a Guide cannot quietly give
-- themselves more people than their church agreed to, and that is as true at a
-- hundred as it was at five.
--
-- A church that wants five again simply sets five. Nothing here removes that.
-- ---------------------------------------------------------------------------

alter table public.churches drop constraint if exists churches_guide_cap_sane;
alter table public.churches
  add constraint churches_guide_cap_sane check (guide_cap between 1 and 100);

alter table public.churches alter column guide_cap set default 100;

update public.churches set guide_cap = 100 where guide_cap < 100;
