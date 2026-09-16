-- A notification goes where it is about.
--
-- ---------------------------------------------------------------------------
-- REPORTED WITH THE SUMMONS CIRCLED IN RED: "when I clicked this notification,
-- it lead me to home page which is misleading cause it didnt lead me to admin
-- room, can please fix this for both guide and explorers."
--
-- "You have been called to a trial room" landed somebody on the church home
-- page. The routing table in components/LiveBell.tsx was never wrong -- it has
-- always had a 'trial' case sending anybody who is not leadership to the case
-- room. The notification simply was not labelled one. open_trial wrote
-- 'approval', and 'approval' for a Guide or an Explorer means "your account was
-- approved", which goes to the church screen.
--
-- So the bug is a label, and it is the worst place in the app to have one: a
-- summons that opens the wrong page is a person who does not know they have
-- been called to answer something. Three of the six were written months ago;
-- TWO OF THEM WERE WRITTEN TODAY, in the Admin Reports work, by copying the
-- surrounding style without asking where 'approval' would send anybody.
--
-- WHY THIS REWRITES RATHER THAN RESTATES. Six function bodies would have to be
-- copied in here to change one string literal in each, and six copies is six
-- things to drift from the originals the next time somebody edits them. Each of
-- these functions contains exactly ONE such literal -- verified before writing
-- this, and verified again by the block itself, which refuses to touch a
-- function where the count is not one rather than guessing which occurrence was
-- meant.
-- ---------------------------------------------------------------------------

do $$
declare
  r     record;
  def   text;
  want  text;
  from_ text;
  hits  int;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('open_trial', 'call_head_judge', 'take_head_judge',
                         'close_trial', 'claim_report', 'say_in_report')
  loop
    -- A case is a case and a report is a report. Both already have a route.
    want  := case when r.proname in ('claim_report', 'say_in_report')
                  then 'report' else 'trial' end;
    from_ := case when r.proname = 'say_in_report' then 'message' else 'approval' end;

    def  := pg_get_functiondef(r.oid);
    hits := (select count(*) from regexp_matches(def, quote_literal(from_), 'g'));

    if hits <> 1 then
      raise exception
        'Refusing to retype %: expected exactly one % literal, found %. '
        'Somebody has edited this function; retype it by hand rather than '
        'letting a blind replace pick the wrong one.',
        r.proname, from_, hits;
    end if;

    execute replace(def, quote_literal(from_), quote_literal(want));
  end loop;
end $$;

-- AND THE ONES ALREADY SITTING IN SOMEBODY'S BELL. Fixing the source leaves
-- every notification sent before now still pointing at the wrong page, which
-- includes the summons that was photographed. These are retyped by what they
-- SAY, which is only safe because the titles are written in exactly one place
-- each, in the functions above.
update public.notifications
   set type = 'trial'
 where type = 'approval'
   and title in ('You have been called to a trial room',
                 'An Executive Director took your case',
                 'The trial room reached a decision');

update public.notifications
   set type = 'report'
 where title in ('Someone is looking at your report',
                 'A new message about a report');
