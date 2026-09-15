-- A Guide's private working copy is never published to the church.
--
-- REPORTED AS: "I deleted this in my guide account and yet it's still here
-- being share in the Explorer." Answered, when asked which way to close it:
-- "a private copy should never be publishable unless it's public."
--
-- WHAT THE DELETE ACTUALLY DID, because it was not the bug. Deleting a series
-- you did not write does not remove it -- it writes a hidden copy for you, and
-- restoreLessonSeries is the undo. That worked. What it cannot reach is a
-- DIFFERENT row that is also published.
--
-- HOW THAT ROW CAME TO EXIST. Editing somebody else's series gives you a
-- private copy (myVersionOfSeries: is_published false, copied_from set). But
-- setSeriesPublished publishes ANY series by id and never asked whether it was
-- a copy. So a private copy could be pushed church-wide, where every Explorer
-- reads it -- ls_read admits any published series in the church.
--
-- WHAT THAT LOOKED LIKE IN THE LIVE TABLE. Three rows titled "Who is Jesus,
-- really?": the genuine original under its own topic with six studies in it, a
-- COPY of it moved to another topic, published, and EMPTY, and two hidden
-- copies of that copy -- two people in turn pressing delete on a thing neither
-- of them could remove. The published empty one is what Explorers saw, and its
-- author had since been deleted, so no Guide could manage it at all.
--
-- The three empty rows were removed. The original and its six studies were not
-- touched.
--
-- WHY THE DATABASE AND NOT THE SCREEN. Hiding the publish control would leave
-- the same call reachable, and the row it writes is read by every Explorer in
-- the church. The rule belongs where the row is written.
--
-- An original is unaffected: copied_from is null on anything a Guide wrote
-- themselves, so publishing their own work is exactly as it was.

begin;

create or replace function private.a_private_copy_is_never_published()
returns trigger
language plpgsql
as $function$
begin
  if new.is_published and new.copied_from is not null then
    raise exception
      'This is your own working copy of somebody else''s study, so it cannot be published to the church. Publish the original, or write a new series of your own.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

drop trigger if exists a_private_copy_is_never_published on public.lesson_series;
create trigger a_private_copy_is_never_published
  before insert or update on public.lesson_series
  for each row execute function private.a_private_copy_is_never_published();

commit;
