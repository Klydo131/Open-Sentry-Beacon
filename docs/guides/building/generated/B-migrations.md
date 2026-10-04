# Appendix B. Every database migration, in order

141 files in `supabase/migrations/`, applied in name order. Each entry is the migration's own opening comment. A migration is never edited once applied; a change is a new file.

#### `0001_core_schema.sql`

Open Sentry Beacon — the core schema.

ONE FILE, ON PURPOSE. The private repo this came from has forty-four migrations, because it grew a church at a time and each step had to be reversible against live data. You do not want that history; you want the shape it arrived at. So this is the destination, written once, with the security fixes that took three audits to find already built in rather than bolted on at migration 38.

#### `0001a_fix_policy_recursion.sql`

Stop profiles and pairings re-entering each other's policies.

WHY THIS FILE EXISTS SEPARATELY. It was applied to the reference database and never written down. A fresh install from this repository therefore got the policies from 0001 and not this correction — which means every install but the first one would have hit `infinite recursion detected in policy for relation "pairings"`, and every journey and pairing read would have failed outright. Recovered from the applied migration history and committed here so the repository can actually build the database it describes.

#### `0002_invitations.sql`

Invitations, and the one place this design could have gone badly wrong.

HOW A PERSON JOINS. There is no public sign-up. A Director invites somebody by email; they get a link; they set a password; they arrive already holding the role they were invited as, in the right church, and — if a Guide recommended them — already paired with that Guide.

THE TRAP, AND WHY THIS TABLE EXISTS.

#### `0003_invite_approval_gate.sql`

An invitation assigns church and role, but it does not approve access.

The invited person first proves control of the e-mail and sets a password. A Director or Executive Director then makes the separate human approval decision. Until that happens the authenticated account can read only its own profile, and the live shell shows the review notice instead of the app.

#### `0004_live_api_permissions.sql`

The browser receives only the table operations the live core actually uses. RLS still decides which rows each signed-in person may reach.

Supabase projects created after the Data API default changed do not automatically grant authenticated access to new public tables. RLS without these grants is safe but unusable: every legitimate request is denied before the policy is evaluated.

#### `0005_platform_function_acl.sql`

Supabase creates this event-trigger helper in public on some projects. It is internal infrastructure, not an application RPC. Revoking invocation does not stop the event trigger itself from running.

#### `0006_blog.sql`

A Guide's blog: written once, read by the people they walk with.

WHY THIS EXISTS ALONGSIDE MESSAGES. A conversation is one-to-one and expects a reply. Some things a Guide wants to say are said once, to everybody, and should sit where an Explorer can read them at midnight without owing an answer by morning.

TWO SWITCHES, NOT ONE. `visibility` decides whether a post exists for anybody but its author — a draft stays private until it is ready. `audience` decides who receives it once published. A single "public" flag would have meant the only way to take a post off the front page is to delete it, and a Guide should be able to retire last month's note without destroying it.

#### `0007_prayer.sql`

Prayer requests, and a wall that cannot name anybody.

TWO AUDIENCES, GIVEN DIFFERENT THINGS ON PURPOSE.

A Guide sees their own Explorers' requests WITH the name attached, because praying for someone you are walking with is the whole point and a nameless request is not something you can follow up in a conversation.

#### `0008_library.sql`

The church library, and what a Guide shares from it.

LINKS, NOT FILES, AND ON PURPOSE. A resource here is a title and a URL. The app also has an on-device library (lib/localMedia.ts) which keeps files in the browser that added them and never uploads them — a real privacy property, and one that cannot move a file between two people. A Guide who "shares" a local file gives an Explorer a title and nothing to play.

#### `0009_meetings.sql`

Meetings: a time the two of them agreed on.

The one piece of the relationship that happens off the app. Everything else here — conversation, library, prayer — supports a person meeting another person, so the app's job is to remember when and where and then get out of the way.

EITHER SIDE MAY PROPOSE, EITHER SIDE MAY CANCEL. Not a Guide-only feature: an Explorer with a Thursday free should be able to say so without waiting to be asked. Both are in the same pairing and the policy treats them the same.

#### `0010_lock_definer_functions.sql`

Close every SECURITY DEFINER function to unauthenticated callers, and close the trigger functions to everybody.

WHY THE EARLIER REVOKES DID NOTHING. Migrations 0006-0009 each said `revoke all on function ... from anon`, and every one of them was a no-op. Postgres grants EXECUTE to PUBLIC by default, PUBLIC includes every role, and revoking from a member does not remove a privilege held through PUBLIC. The functions stayed callable at /rest/v1/rpc/<name> without signing in, and Supabase's own linter is what found it — not the four rounds of policy testing that preceded it, because those tested TABLES and these are FUNCTIONS.

#### `0011_ministry.sql`

Recommendations, a Guide's private tools, and lesson series.

The live app had the relationship loop and none of the ministry around it. These are the tables the sample-data version has had all along.

WHAT IS PRIVATE, AND FROM WHOM. seeker_notes and follow_ups belong to the Guide who wrote them and to NOBODY else — not the Explorer they are about, not the Director above them. A private note a leader can read is not a private note, so the policy is `author_id = auth.uid()` with no leadership branch, rather than a screen that politely declines to render one.

#### `0012_lessons_and_notifications.sql`

Lessons and notifications, matching the reference deployment's shapes.

A notification belongs to exactly one person, and the table has NO insert policy at all. They are written by notify_user(), which is SECURITY DEFINER and refuses unless both people are in the same church. A client that could insert here directly could make the app say anything to anybody, in the app's own voice — which is a more convincing lie than most phishing.

#### `0013_the_invitation_is_the_approval.sql`

The invitation flow, end to end: the mail, the form, and the front door.

Three things were broken between "a Director sends an invitation" and "the invited person is using the app", and they are fixed together because fixing any one alone still leaves a person stuck.

1. THE FORM COULD NOT ASK WHAT THE CHURCH NEEDS TO KNOW. The sign-up the client specified collects a birthday, a city, what someone does, what they would like to study, and — the important one — a recorded permission to hold any of it. `profiles` had columns for none of that, so the live form asked for a name and a password and nothing else, while the demo asked the full set. Same app, two different sign-ups.

#### `0014_mail_settings_fallback.sql`

Where the invitation mailer looks when the project has no Edge Function secrets set.

WHY THIS EXISTS. Edge Function secrets are the right home for an API key and remain the recommended way to configure this. But setting them requires dashboard access, and an installation whose secrets are simply not set has no symptom a Director can see: the function returns 200, reports that it handed back a link instead, and unless somebody reads that response the invitations just stop arriving. That is exactly how a whole day was lost here — a day of pressing Invite and being told each time that the mail had gone.

#### `0015_church_member_contact.sql`

Let a church's leadership see the email address of their own members.

An approval screen listing "Cool — Guide" and "kl — Explorer" with nothing else asks a Director to make a real decision about a real person on the strength of a display name that person typed themselves. The address the invitation went to is the one piece of information that actually identifies them, and it was unreachable: addresses live in auth.users, which no browser-side policy can read.

#### `0016_member_by_email_lookup.sql`

Is this address already somebody in Hope Beacon?

WHY THIS IS NEEDED. Nothing checked, so inviting an address that already belonged to a member created a perfectly valid invitation for them. The Executive Director's own address ended up with an open invitation as a Guide in the Invitations list: the account was untouched and still executive, but the screen said otherwise and there was no way to tell which was true.

#### `0017_invitations_with_real_status.sql`

What "accepted" actually means.

invites.redeemed_at is stamped by handle_new_user, which runs when the AUTH USER ROW is created — and that happens the moment the invitation is sent, because generateLink and inviteUserByEmail both create the account up front. So redeemed_at has always meant "an account exists for this address", never "this person has joined".

The Invitations screen read it as the latter and filed people under Accepted, "joined today", seconds after the Director pressed Send. Somebody who never opened their email, never set a password and never signed in appeared as a member of the church — with no Re-send button, because the screen believed there was nothing left to do. That is the worst shape a bug can take: it hides the very person who needs chasing.

#### `0018_signing_up_is_not_opening_a_link.sql`

Opening a link is not signing up.

WHAT WENT WRONG, in the order it happened.

A Director sends an invitation. The Edge Function creates the account before the message goes, so a row appears in auth.users immediately. The Director, reasonably, copies the join link the screen hands them and opens it to check it works. /join redeems it — and redeeming a link IS a sign-in, so Supabase stamps last_sign_in_at on the invited person and hands that browser their session. The Director is now signed in as the person they just invited, on their own device, and the Invitations screen reports that person as joined.

#### `0019_cancel_invitation_that_actually_cancels.sql`

Cancel has never once worked, and said it did.

The invites_revoke policy allows a delete only where `redeemed_at is null`. redeemed_at is stamped by handle_new_user when the account row is created, which happens the instant Send is pressed — so the condition is false for every invitation that has ever existed. A delete matching no rows is not an error, so the button reported success, the row stayed, and the one-open-invitation-per-address index went on blocking the corrected invitation. An address typed wrongly was un-invitable for good.

#### `0020_one_invitation_per_address_per_church.sql`

One invitation per address per church, guaranteed by the database.

The old index was `unique (church_id, lower(btrim(email))) where redeemed_at is null`. Its condition stopped being true the moment an invitation was sent, because that is when the account row — and therefore redeemed_at — is created. So the index policed nothing, and inviting the same person twice inserted a second row rather than raising the conflict the Edge Function was written to catch. The function's whole resend path hung off that conflict, so pressing Re-send found no open invitation, sent nothing, and reported success.

#### `0021_safeguarding_reports.sql`

Safeguarding reports, for the live app.

The demo has had this since the day it was asked for; the live database has not, which means a real church with real members had no route at all. A Guide and an Explorer talk privately and nobody else can read it — right for the conversation, and exactly the design that needs a way out.

THE ACCESS RULES ARE THE FEATURE. Get them wrong and this is worse than having nothing, because people will trust it.

#### `0022_conversation_attachments.sql`

Files in a conversation, on the live app.

WHY THIS WAS NOT HERE, AND WHY IT IS NOW. The note in lib/live/data.ts was honest: object storage was "a later, deliberate decision with a quota attached". The demo's attachments live in the sender's own IndexedDB, which is a genuine privacy property and also means the bytes cannot travel — the row syncs and the file does not. Fine for a demo on one device, useless for a Guide who wants to send an Explorer a study sheet. This is that decision, made: a private bucket, a row per file, both locked to the two people in the pairing.

#### `0023_trial_room.sql`

The trial room: suspending a member, and removing one.

WHAT THIS IS FOR. A church running this app has no other lever. If somebody sends an Explorer something they should not have, the leadership needs to be able to act tonight, from a phone, without a developer. Reports (0021) gave them the evidence; this gives them the response.

TWO DIFFERENT ACTS, and conflating them is the mistake to avoid:

#### `0024_trial_court.sql`

The trial room becomes a court.

0023 gave a leader two buttons: suspend and remove. That is enough to stop something and not nearly enough to be fair about it. A report is one person's account of what happened; acting on it alone means the other side is judged without ever being heard, by somebody who never asked them anything.

WHAT A TRIAL IS HERE. A case with a written record: who opened it, who was summoned, what each side said in their own words, who judged it, and what was decided. Both sides speak into the same thread. The verdict is attached to the statements that produced it, so a decision can be re-read months later by somebody who was not in the room.

#### `0025_the_executive_bench.sql`

What an Executive Director may do, corrected on two counts.

1. THE CEILING WAS TOO LOW. 0023 refused Executive-on-Executive outright, to avoid a church where whoever clicks first wins. The owner's ruling is that an Executive Director can jail or kick anyone. That is the call to make -- they are the top of the church, and a safeguarding system whose highest authority cannot act on a peer has a hole exactly where the most senior person stands.

#### `0026_jail_switches_the_account_off.sql`

Jail now switches the account off, and release switches it back on.

WHAT WAS WRONG. 0023's suspension was a flag on the profile. It stopped the person sending messages, because the messages policy asks about it, and it archived their pairings -- but they could still sign in, still look around, and every screen that did not happen to ask about suspended_at still worked for them. For a safeguarding hold that is the wrong shape entirely: somebody suspended for harassment could still read the church, see who was there, and watch the people who reported them.

#### `0027_guilds.sql`

Guilds: named groups of Guides and Explorers, made by Directors.

A pairing is one Guide and one Explorer. That is the right shape for discipleship and the wrong shape for everything a church does in groups -- a Bible-study cohort, a campus, a language, a Sabbath afternoon team. Until now the only way to express "these fourteen people belong together" was to remember it, so nobody could see it and nothing could be arranged around it.

#### `0028_the_record_survives_the_person.sql`

A discipline record that outlives the person it is about.

THE FAULT, found while working out how to count how many people had been removed. remove_member_by_leader() deletes the auth user; the profile goes with it; and every row that references the profile with ON DELETE CASCADE goes with that -- including, as of 0024, the trial that removed them and everything said in it. So the act of carrying out a verdict destroyed the record of the verdict, and the question "who has been removed from this church, and why" had no answer at all. 0021 says in its own header that a record which can be made to disappear is not a record; this is the same mistake one table over.

#### `0029_guild_and_church_metrics.sql`

What a Director can actually measure about their guilds, and what an Executive Director can measure about the whole church.

EVERY WORD HERE IS DEFINED, because "doing well" is not a measurement. A dashboard that shows a green badge without saying what earned it teaches a leader to trust a colour. These are the rules, and they are in the function rather than in a comment in the app so that the number and its meaning can never drift apart:

#### `0030_a_guide_carries_at_most_five.sql`

A Guide may walk with at most five Explorers at once.

WHY A LIMIT AT ALL. Nothing stopped a Director pairing one willing Guide with everybody who arrived. That does not fail loudly -- it fails as a Guide with fourteen conversations who answers four of them, and as ten Explorers who each believe somebody is walking with them. The cap makes the shortage visible at the moment of pairing, which is the only moment anybody can do something about it.

#### `0031_nothing_new_is_open_to_anon.sql`

Close every public function to anonymous callers, and keep it closed.

WHAT THE AUDIT FOUND. Three functions in `public` were callable at /rest/v1/rpc/<name> without signing in: enforce_guide_pairing_limit, guide_pairing_limit (both added the day before, by me) and pairing_folder (added in 0022). None was meaningfully exploitable -- one is a trigger function PostgREST cannot invoke, the other two return a constant and a parsed UUID. The problem is not what they leak. It is that 0010 established "nothing in public answers an anonymous caller" and the guarantee had silently decayed, three functions at a time, with nothing to notice.

#### `0032_a_lockdown_must_never_widen_a_grant.sql`

Undo two grants 0031 should never have made, and fix the rule that made them.

THE FAULT. 0031 looped over every function and granted EXECUTE to `authenticated`. A blanket grant cannot tell a function that was never granted from one that was deliberately UN-granted, so it silently overrode every narrower decision anybody had made earlier.

It overrode exactly two, and one of them mattered:

#### `0033_a_minor_is_walked_with_differently.sql`

Under 18: a badge that cannot be taken off, and consent that a Director saw.

WHY THIS IS NOT ONE COLUMN. Two different facts get confused here, and they have different lifetimes:

1. IS THIS PERSON A MINOR. Derived from their birthday, every time it is asked. NOT stored, and deliberately so: a stored boolean is correct on the day a Director ticks it and silently wrong on the person's eighteenth birthday. Nothing would ever tell anybody it had gone stale. Safeguarding controls that quietly become false are worse than none, because people trust them.

#### `0034_the_directors_roster_of_minors.sql`

Every minor in the church, on one screen, with their guardian if we know them.

WHY A ROSTER AND NOT JUST A BADGE. 0033 puts a MINOR badge next to a person wherever a Guide or Director already happens to be looking at them. That is the right thing when you are looking. It is useless for the question a Director actually has to answer, which is "who are all of them, and is anybody missing a consent letter?" A safeguard you can only see by visiting every profile in turn is a safeguard nobody performs.

#### `0035_details_stay_true_and_changes_are_seen.sql`

Accuracy replaces withdrawal, and a change of details is not private from the people walking with you.

THE DECISION THIS ENCODES, in the owner's words: there is no self-service "withdraw permission" button. A member may change their contact details whenever they like, as long as what they put there is true, and when they do, their Guide and their Director see that it changed. Using the app is the undertaking to keep it truthful.

#### `0036_leaders_may_post_and_the_church_may_read_it.sql`

THE BLOG REFUSED EVERY POST BY A DIRECTOR OR AN EXECUTIVE DIRECTOR.

blog_write required auth_role() = 'dm'. A Guide could write; the people who run the church could not, and what they got was a row level security violation with no explanation. The Executive Director hit it on their own app.

The read side had the matching hole. can_read_post required is_paired_with(author), which is right for a Guide writing to the people they walk with and wrong for a Director: a Director has no pairings, so a post by one was readable by nobody at all. Fixing only the write would have produced posts that saved and then vanished, which is worse than the refusal.

#### `0037_a_face_to_put_to_the_name.sql`

A picture, or a chosen icon, for a live account.

The tutorial has had both since the beginning and the live app had neither: no columns, no picker, nothing. Every member in a real church was a pair of initials on a coloured circle, including on the card their Guide opens every week.

TWO COLUMNS, BECAUSE THEY ARE TWO DIFFERENT THINGS. `avatar` is one of a short list of emoji the person picked. `photo_path` is an object in storage they uploaded. A photo wins when both are set, and clearing the photo falls back to the icon rather than to nothing.

#### `0038_a_guide_may_write_their_own_studies.sql`

A GUIDE COULD NOT WRITE A LESSON. That is the whole of the complaint.

lesson_series and lessons both had a single write policy, manages_church(church_id), so only a Director or an Executive Director could create anything. A Guide, the person actually sitting with somebody week by week, could look at a list of titles and nothing else. There was no way to attach a handout, and nothing for an Explorer to open.

WHO OWNS WHAT, NOW. A Director writes for the church, as before. A Guide writes their own, and may only edit and delete their own. An Explorer reads anything published in their church, and opens the files.

#### `0039_the_church_noticeboard.sql`

Announcements: the notices a church pins where everyone will see them.

The tutorial has had a row of these since the beginning and they were three hard-coded strings, which is fine for a demonstration and useless to a real church. This is the table behind them.

WHY NOT REUSE THE BLOG. A blog post is somebody's writing, addressed to the people they walk with, and it belongs to its author. A notice is the church's: Sabbath worship is at nine, the week of prayer starts Monday. They have different authors, different lifetimes and different audiences, and collapsing them would mean a Guide's reflection on Psalm 23 sitting in the same list as the times of a meeting.

#### `0040_a_church_may_raise_the_guide_cap.sql`

FIVE IS A CEILING, AND SOMETIMES A CHURCH HAS MORE EXPLORERS THAN GUIDES.

The cap was a hard-coded 5 with no way past it, so a church with thirty Explorers and four Guides simply could not pair the last ten people. Those Explorers sat in an app where nothing happened, which is the exact outcome the cap exists to prevent.

WHAT DOES NOT CHANGE. Five is still the default and still the number the design is built around: it is how many people one person can actually walk with. Raising it is a decision a church makes knowingly, recorded on the church so anybody can see what this congregation chose.

#### `0041_approval_changes_are_recorded_too.sql`

Approvals and refusals leave a record, like every other decision about a person.

THE HOLE THIS FILLS. `discipline_log` recorded suspending, releasing and removing somebody. It did not record approving or disapproving them — so "how many people did we turn away this quarter?" had no answer anywhere in the database. The profile carried `is_approved = false` and nothing else: not when, not who by, not whether it had ever been true. A Director asking that question was asking about an event the app had never written down.

#### `0042_anybody_may_write_and_the_church_may_read.sql`

Blogs everyone can actually publish.

WHAT WAS WRONG. Writing was limited to Guides, Directors and Executive Directors, so an Explorer who opened "Your blog", typed a post and pressed publish got `new row violates row-level security policy for table "blog_posts"`. The screen offered them something the database refused. That is the worst shape a permission can take: not a locked door, a door drawn on a wall.

#### `0043_who_is_actually_using_it.sql`

"How many Guides were active this week?" — answered from what the app records.

THE HONEST PART FIRST, because this is the number most easily faked.

Beacon does NOT log sign-ins. There is no `last_seen_at`, nothing writes one, and adding one tonight would report every member inactive tomorrow because the column would have no history. So "active" here does not mean "opened the app". It means SOMETHING THIS PERSON DID WAS RECORDED in the window:

#### `0044_a_guide_may_post_a_notice.sql`

Guides write notices too, and a notice can go to fewer than everybody.

WHAT WAS WRONG. Announcements were leadership-only and church-wide only, and migration 0039 argued for that in a comment: "a notice that only some of the congregation can see is not a notice". That is true of a NOTICEBOARD, and it was the wrong model for the thing a Guide actually needs. A Guide arranging something for the five people they walk with has no way to pin it anywhere those five will see it, so it goes in five separate conversations and is missed by whoever does not scroll back.

#### `0045_every_notice_is_for_everybody.sql`

Every announcement goes to the whole church. No audience, no choice.

THIS UNDOES HALF OF 0044, ON PURPOSE, AND THE OTHER HALF STAYS.

0044 did two things: it let Guides pin a notice, and it gave a notice a private audience. The first was right and stays. The second is now decided against: a notice is for everybody, and the owner has said so plainly.

#### `0046_guides_ask_and_guides_talk.sql`

Two things a Guide could not do, and both were gaps rather than decisions.

1. ASK TO WALK WITH SOMEBODY. A Guide could recommend a NEW person for an invitation (migration 0016), and could do nothing at all about an Explorer who is already in the church and waiting for a Guide. The only route was to catch a Director in person and ask. So the one screen that shows who is unpaired belongs to the Director, and the people who actually have room to carry somebody had no way to say so.

#### `0047_a_guide_can_name_who_is_waiting.sql`

Two narrow windows, because a Guide can see almost nobody, and that is right.

WHAT I FOUND, AND IT IS A DELIBERATE DESIGN RATHER THAN A GAP. A Guide can read exactly two profiles: their own, and the Explorer they walk with. Not other Explorers, not other Guides. That is the promise the app makes and it should stay.

It also makes both features in migration 0046 impossible as built:

#### `0048_a_study_sheet_is_a_word_document.sql`

Word documents, spreadsheets and slides can be attached to a conversation.

THE BUG, from a phone: a Guide attached a study sheet and the conversation answered "mime type application/vnd.openxmlformats-officedocument.wordproc- essingml.document is not supported". That sentence is Supabase Storage reading the bucket's allow-list out loud. Nobody can act on it, and the thing it refused is the single most ordinary file a church passes around.

#### `0049_the_explorer_is_told_somebody_is_praying.sql`

An Explorer finds out that their Guide is praying for what they asked.

THE GAP. Asking for prayer is the most exposed thing somebody does in this app, and until now the answer to it was silence. The request appeared on the Guide's Care page with no control of any kind, so even a Guide who read it and prayed that evening had no way to say so, and the person who asked saw their own words sitting there exactly as they left them. From where they stand that is indistinguishable from nobody having looked.

#### `20260816130240_approval_revocation_gate.sql`

*2026-08-16*

Disapproval is a reversible access suspension, not merely a UI flag. A suspended account may read and edit its own profile so the app can explain what happened, but it cannot exercise leadership, use a pairing, read or send messages, or read/write journey history through the Data API.

#### `20260829225000_claim_pending_invitation.sql`

*2026-08-29*

A recovery link does not fire auth.users' INSERT trigger.

A person can have an old, unassigned Hope Beacon account and later receive a real invitation. Supabase correctly sends that person a recovery email, because the account already exists. The `handle_new_user` trigger therefore cannot run again to copy the invitation's church and role into the profile. The result was an unapproved profile with no church, invisible to the Directors who should approve it.

#### `20260830120000_security_audit_and_guild_activity.sql`

*2026-08-30*

Security audit rooms and member-facing Guild activity.

Audit events deliberately contain no message or file content. Directors see activity about Guides and Explorers in churches they lead; Executive Directors additionally see activity about Directors. Guild activity is shared on purpose, but never exposes an Explorer roster or another Explorer's profile identifier.

#### `20260830230607_qualify_security_audit_profile_id.sql`

*2026-08-30*

The TABLE return field named `id` is also a PL/pgSQL variable. Qualify the profile lookup so Postgres does not confuse that output variable with the profiles primary key when leadership opens the Security Audit Room.

#### `20260831060000_a_way_out_of_the_guild_room.sql`

*2026-08-31*

The Guild Room needed a way out of it.

The board that shipped on 30 August lets Guides and Explorers broadcast a thousand characters to a group. Verified against the live database before writing this:

* a Director or an Executive Director cannot read the board at all; * nobody but the author can remove anything from it, leadership included; * there is no route for a member to say a post is wrong.

#### `20260901090000_the_library_belongs_to_everybody.sql`

*2026-09-01*

The library nobody could add to, and the record that makes it safe to open.

FIRST, THE BUG, because it explains the screenshot. Adding a resource showed "You do not have permission to do that. If that seems wrong, ask your Director." Nothing was wrong with anybody's permission. Proved against the live database and rolled back:

insert into materials (...) returning id -> refused, "new row violates row-level security policy" the same insert with no returning clause -> allowed

#### `20260901120000_close_the_doors_nobody_uses.sql`

*2026-09-01*

Close the doors nobody uses.

Nothing here fixes a leak that is happening. The audit that produced this migration probed every table in the schema as the signed-out `anon` role and every one of them returned zero rows. The problem is WHY they returned zero.

THE SHAPE OF THE RISK. Supabase grants `anon` and `authenticated` every privilege on every new table by default, and Row Level Security is what takes it back. A policy written without a `TO` clause applies to PUBLIC — which includes `anon`. Thirteen policies here were written that way. They are safe today only because each one compares something against `auth.uid()`, which is NULL for a signed-out caller, so the test can never be true.

#### `20260901123000_the_bucket_names_its_roles_too.sql`

*2026-09-01*

The three storage policies the first sweep missed.

`close_the_doors_nobody_uses` named the roles on thirteen policies in the public schema and then a new guardrail, reading the migrations rather than the database, found three more it had not looked at: the conversation attachment policies on `storage.objects`, written in 0022 with no `TO` clause. They apply to PUBLIC, and `anon` holds every privilege on `storage.objects` by default, so the signed-out role reaches them.

#### `20260901130000_the_megaphone_goes_back_in_the_box.sql`

*2026-09-01*

Nobody calls `notify_user` from a browser, so nobody should be able to.

`notify_user(user, type, title, body)` writes a row straight into somebody else's notification bell, with a title and a body chosen by the caller. It guards itself against the obvious abuse — its own comment says "without this the function is a megaphone" — by refusing to write to anybody outside the caller's church.

That check is real, and it is the wrong shape for what the function turned out to be. It asks WHERE the recipient is, never WHO is asking. Any approved member could put any words in front of any other member of their church, under the app's own chrome, and the bell gives those words the app's authority. "Your account needs to be re-verified" is a convincing message when it arrives in the same place as "Your Guide is praying with you."

#### `20260901140000_a_database_trigger_cannot_delete_a_photograph.sql`

*2026-09-01*

Undo a fix that did not work, and put the working one where it belongs.

WHAT WENT WRONG. `close_the_doors_nobody_uses` added a trigger, `forget_stored_files`, that deleted from `storage.objects` when a profile was deleted, so that a person who asks to be erased does not leave their photograph on the server. It was written, reasoned about, committed, and described in a commit message as working. It was never run.

It cannot work. Supabase puts a `protect_objects_delete` trigger on `storage.objects` that raises `42501` on ANY direct delete —

#### `20260902020000_the_screen_keeps_up_without_a_refresh.sql`

*2026-09-02*

Live updates everywhere, not just in a conversation.

WHAT WAS WRONG. One table was published for realtime: `messages`. So a conversation updated itself and every other screen in the app did not. Post a notice, approve somebody, add a study, share a resource, answer a prayer -- and the person looking at that screen saw the old version until they pulled to refresh. In a demonstration, in front of a room, that reads as the app being broken, and there is no way to explain it that sounds like anything else.

#### `20260902060000_a_report_can_carry_evidence.sql`

*2026-09-02*

Evidence on a safeguarding report.

WHAT WAS MISSING. A report carried a reason and a paragraph of text and nothing else. The thing being reported is very often a picture, a screenshot of a conversation, a voice note or a document — and the person raising it had nowhere to put any of it. They were asked to describe, in their own words, something they were holding on their phone. A Director then decided on that description alone.

#### `20260902070000_a_director_can_pin_a_post.sql`

*2026-09-02*

A Director can pin a post to the top of the church's writing.

WHY. The feed is newest-first, which is right for a conversation and wrong for the one post a church wants every new person to read. A welcome written today is the first thing an Explorer joining tomorrow sees, and the fortieth thing an Explorer joining in a month sees. Pinning is how the church says "start here" without having to repost it every week.

WHY IT IS A FUNCTION AND NOT AN UPDATE. `blog_edit` lets an author change their own post and nobody else's, which is correct and is exactly what makes pinning impossible through it: the point is that a DIRECTOR decides what the church leads with, including on a post a Guide wrote. Widening blog_edit to let leadership update any post would also let them rewrite its words, which is a different and much larger power than choosing the order. So the function touches one column and refuses everything else by construction.

#### `20260902080000_a_guide_waits_for_a_director.sql`

*2026-09-02*

A Guide waits for a Director. An Explorer does not.

THE BUG. `handle_new_user` set `is_approved` to `v_invite.id is not null` — anybody holding an invitation was approved the instant their account existed. So the approvals screen was permanently empty and no Director ever approved anybody: an invited Guide redeemed a link and was inside, walking with people, before any second person had looked.

WHY THE INVITATION IS NOT ENOUGH ON ITS OWN. It is one decision, made when the address was typed, and the person who redeems a link is not necessarily the person it was sent to — a forwarded email, a shared inbox, a mistyped address that happens to belong to somebody real. For an Explorer that is a small problem: they can see their own journey and nothing else. For a GUIDE it is the whole safeguarding model, because a Guide is handed private conversations with people the church is walking alongside.

#### `20260902090000_an_executive_appoints_the_bench.sql`

*2026-09-02*

An Executive Director appoints another Executive Director, by email.

TWO RULES DISAGREED, AND THE STRICTER ONE WON SILENTLY. The invite edge function says "only an Executive Director can invite another Executive Director" — a rule about WHO may do it. The database trigger underneath said "Executive Directors are appointed, not invited" — a rule that nobody may, ever. So the screen offered Executive Director in its list, the function allowed it, and the insert was refused at the last moment with a sentence that reads like a policy rather than a bug. It was written when there was no way to appoint one at all and was never revisited once the function grew the narrower rule.

#### `20260902100000_a_pair_can_be_made_again.sql`

*2026-09-02*

Two people who were unpaired can be paired again.

THE BUG, REPORTED FROM A PHONE. A Director disconnected two people, tried to pair them again, and got:

duplicate key value violates unique constraint "pairings_ds_id_dm_id_key"

`pairings_ds_id_dm_id_key` was UNIQUE (ds_id, dm_id) with no condition on it, and disconnecting does not delete the row — it sets status to 'archived', deliberately, so the history of who walked with whom survives. Those two facts together mean the archived row keeps that pair's slot FOREVER: the two people can never be paired again, by anybody, for the life of the church.

#### `20260902110000_one_explorer_one_guide.sql`

*2026-09-02*

One Explorer, one Guide, enforced by the database itself.

The migration before this one could not do it. A partial unique index cannot be built while rows already breach it, and four Explorers each had two active Guides, so the rule went in as a trigger and the four were left for a person to settle. They have now been settled: the pairing that carried the real conversation was kept, and where neither did, the first one made.

#### `20260904090000_a_study_is_yours_to_change.sql`

*2026-09-04*

Everybody may change a study, and nobody changes it for anybody else.

THE ASK, after seeing the first attempt: "All users can edit and delete Lesson privately based on their own account, not universal."

The church's shared studies are a STARTING POINT, not a fixed text. A Guide who wants to cut a paragraph, change an example so it lands with the person they walk with, or drop a study they will never use, should be able to. What they must not be able to do is change it for the other sixteen Guides, and the first version of this let a Director do exactly that, church-wide, from a button that looked like an ordinary edit.

#### `20260904100000_feedback_reaches_the_church.sql`

*2026-09-04*

Feedback that goes somewhere.

THE REPORT: "Feedback is not working, I am pretty sure some feedbacks are still stuck in the database since I haven't received any email feedbacks."

Nothing was stuck. There was no feedback table, and `setFeedbackSink` is never called anywhere in the app, so every message went to the DEFAULT sink -- which honestly saves to the sender's own browser and says so. Each message is sitting in `hope-beacon.feedback.local` on the phone of whoever wrote it, has never crossed the network, and cannot be recovered centrally because it was never centrally anywhere.

#### `20260904100100_feedback_you_can_see_your_own.sql`

*2026-09-04*

You can read your own feedback back.

FOUND BY PROBING THE PREVIOUS MIGRATION, not by reading it. The read policy was leadership-only, which is right about other people's messages and has a consequence that is easy to miss: `insert ... returning` needs SELECT on the row it returns, so a member sending feedback through any client that asks for the row back is refused by the READ policy while the WRITE policy is happy.

#### `20260904110000_a_shelf_of_your_own.sql`

*2026-09-04*

You can take a resource off YOUR shelf without taking it off everybody's.

THE ASK: "for the samples, users can add and remove it too."

Adding was already open to everybody -- migration 20260901090000 widened it to Explorers. Removing was not, and could not simply be widened, because the library is one shared shelf: a Guide pressing Remove on a link the church added would take it off sixteen other people's shelves, and the person who pressed it would have no idea they had done that.

#### `20260904120000_the_named_guide_is_paired_on_approval.sql`

*2026-09-04*

The Guide chosen on the invitation is paired the moment the Explorer arrives.

REPORTED: "The pair with Guide when I invite an Explorer for the first time is not working in the sub room approval. If I pair an invited Explorer to a guide, they should be paired right away."

THREE SEPARATE BUGS SAT ON THIS ONE PATH. Each was found by probing the live database rather than by reading, and the third is the one that was reported.

#### `20260904130000_the_guide_check_pins_its_search_path.sql`

*2026-09-04*

Pin the search_path on the one-Guide-per-Explorer check.

FOUND BY AUDIT, not by anything failing. Supabase's own linter reports `function_search_path_mutable` against `public.one_guide_per_explorer`, and it is right: the function was added earlier today and is the only trigger function in this schema without `set search_path`.

WHY IT MATTERS EVEN THOUGH THIS ONE IS NOT `security definer`. A function with a mutable search_path resolves `public.pairings` through whatever the caller's search_path happens to be at the time. Every reference in the body is already schema-qualified, so there is no exploitable path here today -- this is closing the door before somebody adds an unqualified reference to the body in a year and turns a lint into a bug. It costs one line.

#### `20260904140000_the_first_password_is_temporary.sql`

*2026-09-04*

Remember that somebody is still using the password their invitation gave them.

WHY THIS COLUMN EXISTS. The invitation now creates the account with a password already on it and puts that password in the message, because a one-time link expires, is spent by the first mail scanner that opens it, and fails on the second tap -- which is how twenty-three people ended up stuck at once, each holding an account with no password and a dead link.

The cost of that trade is real and is not hidden: a password sitting in an inbox can be read by anybody who can read that inbox, and it stays true until it is changed. So the app has to be able to ASK. Without somewhere to record "this one came from an email", the reminder would either nag everybody forever or nobody at all.

#### `20260904150000_the_example_studies_have_sources.sql`

*2026-09-04*

The example studies are Christ-centred, plainly written, and sourced.

WHAT WAS ASKED FOR, in two messages:

"I want the sample lesson studies to have sources with the 7th day Adventist sources please, not some random published no basis points. Explorers should see more on Christ than the church doctrine (but it must have embed with 7th day Adventist values too)... I dont want to see lesson studies that are just random automated by AI, it must have a strong content with strong sources too."

#### `20260904160000_an_explorer_reads_the_studies.sql`

*2026-09-04*

An Explorer reads the studies. They do not write them.

THE OWNER'S DECISION, IN THEIR WORDS: "for Explorers they cannot edit what the sample Lesson studies are, only EDs, Directors and Guides can do that... Explorers can only see all of the Lesson studies from the sample and what the guide provided."

THIS REVERSES PART OF `a_study_is_yours_to_change`, DELIBERATELY. That migration widened writing to everybody, on an earlier instruction that everybody should be able to keep their own edited copy. The owner has narrowed it, which is theirs to decide and is the better shape for this app: a study is teaching material, and the people who teach are Guides, Directors and Executive Directors. An Explorer is being walked with, not preparing the walk.

#### `20260904170000_the_reading_is_recorded.sql`

*2026-09-04*

An Explorer marks a study read, and their leaders can see how far they have got.

THE ASK, in the owner's words: "Can we add the progress bar that can be recorded by the EDs and Directors if the Explorer is really Reading the Lesson studies from the samples and the Guide made for the Explorer."

WHAT DID NOT EXIST. `lesson_assignments` records that a Guide handed a whole SERIES to a pairing, and carries one `completed_at` for the series. Nothing anywhere recorded a single lesson being read, so there was no numerator for a progress bar and no way to answer "has this person actually opened anything?" The demo half of the app has had a bar since the beginning; the live half, the one real people use, had none.

#### `20260904170100_the_screen_keeps_up_with_the_reading.sql`

*2026-09-04*

The progress bar keeps up too.

`lesson_reads` is new (20260904170000) and a table outside the `supabase_realtime` publication is a table whose changes no screen ever hears about. A Director watching an Explorer's bar would have seen it move only on a manual reload, which for a number that changes while you are looking at it is the same as not working.

THE WHOLE LIST IS RESTATED, not just the new row, and that is on purpose: `tests/the-screen-keeps-up.mjs` reads the NEWEST migration matching `the_screen_keeps_up` and holds it against every KEEP_UP_* set in lib/live/keep-up.ts. A migration here that named only the new table would make that test believe the other twenty had been dropped.

#### `20260907120000_an_invited_executive_can_see_their_church.sql`

*2026-09-07*

An Executive Director who arrived by invitation can see their own church.

REPORTED AS "I dont see the names when it comes to pairing", from a phone and then from a laptop. The Guide picker on the pairing form opened with one row in it, "Choose guide", and no people.

The people were there. The church has forty-two approved Guides and forty-five approved Explorers. What was missing was the reader's permission to see any of them, and the picker was simply the first place that showed. Measured, per Executive Director, by running the real policies as each of them:

#### `20260907140000_signing_in_is_joining.sql`

*2026-09-07*

Somebody who has signed in has joined, and their password is theirs to keep.

REPORTED TWICE IN ONE BREATH:

"some e-mails are already in the system but still in the re-send mail list, any e-mail that is already part of the Open Sentry Beacon should not be in the re-send mail list."

"When the E-mail invitation is sent, access to password is randomized, but once the user clicked and used the account the e-mail password that was sent should remain and can't be changed because that's a resident account already."

#### `20260908033953_guide_only_lesson_planning.sql`

*2026-09-08*

BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.

Applied to the live database as `guide_only_lesson_planning` and never committed, so a fresh install from this repository had no lesson_guide_shares table at all, and nobody reviewing the repository could see its policies -- one of which compares a column with itself. That is corrected, not here, in 20260923180000_a_door_compares_the_right_things.sql.

Everything below the rule is the applied text, byte for byte: its md5 was checked against supabase_migrations.schema_migrations before it was committed. The live text ends in one stray carriage return, which .gitattributes (eol=lf) strips on commit; that trailing byte is the only difference. It is already in the live database, which records migrations by the time they ran, so this file changes nothing there. It exists so that a fresh database built from this repository is the same database. Applied after the 2026-09-01 Claude production migrations.

#### `20260908033958_prayer_encouragements.sql`

*2026-09-08*

BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.

Applied to the live database as `prayer_encouragements` and never committed, so a fresh install from this repository had no prayer_encouragements table and the prayer room's private thread failed for every fork.

Everything below the rule is the applied text, byte for byte: its md5 was checked against supabase_migrations.schema_migrations before it was committed. The live text ends in one stray carriage return, which .gitattributes (eol=lf) strips on commit; that trailing byte is the only difference. It is already in the live database, which records migrations by the time they ran, so this file changes nothing there. It exists so that a fresh database built from this repository is the same database. A private encouragement thread attached to each prayer request. Applied after the 2026-09-01 Claude production migrations.

#### `20260908034003_audited_pairing_library_sharing.sql`

*2026-09-08*

BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.

Applied to the live database as `audited_pairing_library_sharing` and never committed, so a fresh install from this repository had none of the pairing-level library controls the app calls: share_library_link, set_pairing_library_sharing, library_pairing_controls, library_sharing_status.

Everything below the rule is the applied text, byte for byte: its md5 was checked against supabase_migrations.schema_migrations before it was committed. The live text ends in one stray carriage return, which .gitattributes (eol=lf) strips on commit; that trailing byte is the only difference. It is already in the live database, which records migrations by the time they ran, so this file changes nothing there. It exists so that a fresh database built from this repository is the same database. Pairing-level safety for the audited church library, applied after its canonical ledger.

#### `20260908042254_the_screen_keeps_up_with_prayer_encouragements.sql`

*2026-09-08*

BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.

Applied to the live database as `the_screen_keeps_up_with_prayer_encouragements` and never committed, so prayer encouragements were never on the realtime publication of a fresh install.

Everything below the rule is the applied text, byte for byte: its md5 was checked against supabase_migrations.schema_migrations before it was committed. It is already in the live database, which records migrations by the time they ran, so this file changes nothing there. It exists so that a fresh database built from this repository is the same database. Prayer encouragements update while the Guide and Explorer are looking at the same private thread. This restates the full watched-table list because tests/the-screen-keeps-up.mjs validates the newest realtime migration as the complete publication contract.

#### `20260908120000_a_resource_is_personal_until_it_is_shared.sql`

*2026-09-08*

A resource is yours until you hand it to somebody.

REPORTED AS: "Why is it the resources are shared by other guides and Explorers, it should be contained and personal with each other, not a group study" -- and then, precisely: "not a group study by OTHER guides and explorers. If the Guide has multiple explorers, it should be private for those designated explorers."

HALF OF THAT WAS ALREADY TRUE, and it is worth saying which half before changing anything. `shares_read` is `in_pairing(pairing_id)`, so a share into one pairing is invisible to every other pairing: a Guide walking with five people hands something to one of them and the other four cannot see it. Explorers also never had the church-wide arm of `can_read_material`, which is gated on `auth_role() in ('dm','admin','executive')`. So nothing ever leaked between Explorers.

#### `20260908150000_a_record_that_outlives_the_people_in_it.sql`

*2026-09-08*

What happened, kept in a form that survives the people leaving.

ASKED FOR IN THESE WORDS: "before you delete, make sure to keep some records of data (dont delete the data, only delete the email please and the accounts of the email)" and "All the activities and important datas needs to be recorded to improve the app".

WHY A SEPARATE TABLE RATHER THAN TRUSTING THE ROWS THAT ARE ALREADY THERE. Thirty-seven tables cascade off `profiles`. Deleting an account does not leave its history behind; it takes the pairings, the prayer requests, the materials, the lessons, the meetings and the journey events with it. So any record meant to outlive an account cannot hold a foreign key to one, and this table deliberately holds none.

#### `20260908170000_every_room_keeps_up.sql`

*2026-09-08*

Every room keeps up, not just the ones that got there first.

REPORTED AS: "I still dont like that most users complain that they need to refresh their browser to get the real time results."

WHAT WAS ALREADY RIGHT, because it is worth ruling out before adding anything. Migration 20260902020000 publishes twenty-four tables and sets replica identity full on them. The browser client authenticates its realtime socket and re-authenticates on every heartbeat, so a token refresh an hour in does not silently kill the stream. Checked in the installed library rather than assumed: @supabase/supabase-js 2.112.3 wires the custom accessToken callback into the realtime client, and realtime-js calls setAuth again each time a heartbeat is sent.

#### `20260908180000_safeguarding_stays_off_the_wire.sql`

*2026-09-08*

The safeguarding record does not travel over a socket.

THIS IS A CORRECTION, and it is worth saying so plainly rather than dressing it as a decision.

The first version of 20260908170000 published the safeguarding tables along with everything else: reports and their files, trials and their statements and parties, the discipline log, the security audit, and a Guide's private notes. The reasoning was that realtime evaluates the same row level security as a SELECT, so publishing a table adds a delivery path for people who already have one and adds nothing for anybody else.

#### `20260909100000_the_cases_room_keeps_up.sql`

*2026-09-09*

The Cases room and the safeguarding queue keep up too.

THE OWNER'S DECISION, asked for in these words: "make the Cases room and safeguarding live too please".

This reverses the rule that migration 20260908180000 restored, and the history is worth leaving legible rather than tidying away: these tables were published, dropped when the verify gate pointed out that a standing decision said otherwise, and are published again now because the person whose decision it is has made a different one. That is not churn, it is the rule changing hands. The reasoning behind the old rule is preserved in 20260908180000 so nobody has to reconstruct it.

#### `20260909180000_the_guild_wall_keeps_up.sql`

*2026-09-09*

The Guild Room wall keeps up, WITHOUT handing over who wrote what.

THE PROBLEM, AND WHY THE OBVIOUS FIX IS THE ONE THING THAT MUST NOT HAPPEN.

The Guild Room is the one screen where several people look at the same wall at once, so it is the screen where a stale view is most obvious -- and it was the last room in the app that still needed a manual refresh.

#### `20260909200000_a_message_can_be_changed_or_taken_back.sql`

*2026-09-09*

Editing and deleting a message, and the record that survives both.

WHAT WAS ASKED FOR, AND THE HOLE IT WAS ABOUT TO BE BUILT ON TOP OF.

Asked for: "Messages in chat can be edited and be deleted (if it's deleted there must be a message or note 'user X has deleted a message')."

Before any of that, a live fault, found while looking for where edit would go. `messages_mark` is an UPDATE policy that exists so the RECIPIENT can stamp `read_at`:

#### `20260910090000_the_browser_writes_only_what_the_app_writes.sql`

*2026-09-10*

The browser may write only the columns the app actually writes.

FOUND BY AUDIT, AFTER THE SAME FAULT WAS FOUND IN THE CONVERSATION.

Yesterday `messages_mark` turned out to be an UPDATE policy written for read receipts that also let either person rewrite the other's words, because RLS is ROW level and says nothing about columns. That is not a one-off; it is a shape. This migration is the result of looking for every other instance of it.

#### `20260910100000_guardian_consent_is_scoped_to_the_church.sql`

*2026-09-10*

Guardian consent is a Director's power over THEIR OWN church, not every one.

WHAT THE AUDIT FOUND.

This app has two families of authorisation helper and they are not interchangeable:

is_admin() / is_executive() the caller's ROLE. No church. leads_church(c) / manages_church(c) the caller's role AND that church.

#### `20260910140000_the_guides_room_can_correct_and_take_back.sql`

*2026-09-10*

Editing and taking back in the Guides' room, and a delete that stops destroying the thing it removes.

WHAT WAS ALREADY HERE, AND WHY IT WAS THE WRONG SHAPE.

Unlike the Explorer conversation, this room COULD already delete: `guide_room_drop` permits the author or church leadership. Three things were wrong with it, and only the first is the feature that was asked for.

#### `20260910160000_the_guild_wall_can_be_corrected.sql`

*2026-09-10*

The Guild wall can be corrected, and taking a post down stops destroying it.

THE THIRD ROOM, AND THE ONLY ONE WHERE THE NOTE MUST NOT NAME ANYBODY.

Asked for: edit on the Guild wall too. It is the last of the three rooms without it -- a post could be amen'd, reported, deleted by its author or removed by leadership, and a typo in it stood for good.

#### `20260910180000_talk_is_a_room_of_its_own.sql`

*2026-09-10*

The conversations a person has, and how many are waiting.

WHY THIS EXISTS.

Reported: the chat should be a place you go, not a card you scroll past. "Most users want always the present chat that doesn't need to scroll down for other features, specially for Explorers... For guides... they want the Chat to be exclusive only because it's their main connection to the Explorers."

#### `20260910200000_nobody_can_flood_a_room.sql`

*2026-09-10*

A floor under how fast one account can write.

WHAT WAS MISSING. Nothing in this database limited how fast anybody could write. An approved member could insert into `messages` as quickly as the network allowed, and there are two separate costs to that:

HARASSMENT. This app's answer to one person hurting another is the report route and a Director. That is the right answer to what somebody SAYS, and no answer at all to somebody sending four hundred messages in a minute -- which is a thing a person can do to somebody they are paired with, and which the Explorer on the other end experiences as the app being unusable.

#### `20260911100000_the_shelf_knows_what_it_is_holding.sql`

*2026-09-11*

The kind on a library row matches what is actually at the address.

WHAT WENT WRONG. The add form asks for a Kind, offers five, defaults to "Link", and puts the dropdown BELOW the address box -- so somebody pasting a YouTube URL reaches the Add button before they reach the question. The field is whatever the form defaulted to on almost every row.

Harmless while the kind was a small icon. Then filter chips were built on it ("Video 2", "PDF 1"), and a field nobody maintains became a control that LIES: on this church's shelf two of the nine rows filed as 'link' are YouTube videos, so tapping Video hid half the real videos and the person tapping had no way to know.

#### `20260913100000_a_pairing_records_when_it_ended.sql`

*2026-09-13*

When a pairing ended, recorded rather than inferred.

WHAT A DIRECTOR COULD NOT SEE. Asked for directly: "EDs and Directors should know when did the Guide and Explorer connected so we there would be a track record." Half of that was already possible and simply never drawn -- `pairings.created_at` has always been in the browser, on every row, and the roster showed two names and a stage and no date at all.

The other half did not exist. A pairing ends by `endPairing` setting status = 'archived', and nothing anywhere wrote down WHEN. Fifty-three of this church's pairings are archived and not one of them can say what day it stopped.

#### `20260913140000_an_approval_is_a_dated_decision.sql`

*2026-09-13*

When somebody was approved, and by whom.

THE ONE DECISION THIS TABLE DID NOT RECORD. Asked for alongside the pairing dates: "approvals should have a date too please, make sure the connection of Guide and Explorer pairing and approval must have a live date record."

`is_approved` is a bare boolean. Every other consequential thing that happens to a profile carries a timestamp, and the two heaviest carry an actor as well:

#### `20260913180000_a_room_for_the_apps_a_church_uses.sql`

*2026-09-13*

The other apps a church already uses, one tap away.

WHAT THIS IS FOR. Asked for directly: a room holding "the official Bible that SDA uses, SDA hymnals, etc", so that "when they tap or click it, it automatically goes to the app destination" -- the installed app where there is one, the website otherwise, on any phone or desktop.

WHY A TABLE AND NOT A LIST IN THE SOURCE. Two reasons, and the second is the one that decided it.

#### `20260913200000_a_director_can_pair_the_waiting_list.sql`

*2026-09-13*

Propose pairings for everybody who is waiting, in one go.

WHY. Asked for by the owner: "if there are too many candidates and the ED or Director have to input alot of Guides and Explorers inside the system of the app, there must be a button for auto pair." The one-at-a-time form above it is two fields and a button, and doing that forty times is why it does not get done.

THIS PROPOSES. IT DOES NOT PAIR.

#### `20260914090000_an_invitation_to_somebody_who_was_removed.sql`

*2026-09-14*

An invitation whose account has since been removed must stop offering to send.

REPORTED FROM THE SCREEN, with a photograph of two rows: "I can still see the e-mails that I sent here that should have been disappeared because they where part of the system before and now they are deleted. If the e-mail is part of the system of the app, the re-send should be gone please."

WHAT THE ROW SAID, AND WHY ALL OF IT WAS WRONG. Both rows read "invited 7 days ago - never sent" and offered Re-send. Neither part was true. The invitation had been sent, the person had joined, and their account was later deleted. The screen could not tell, because it was reading the absence of an auth row -- and a deleted account and an account that was never created are the same absence.

#### `20260914100000_a_departing_inviter_is_not_a_new_invitation.sql`

*2026-09-14*

A departing inviter is not an invitation being made.

REPORTED AS: "Why can't I delete this 2 accounts? It's some kind of bug" -- and then, when the permission was questioned, "but I am the head ED, so I must have the privilage to delete an ED or Director."

THE PRIVILEGE WAS NEVER THE PROBLEM, and that is worth recording because it is where the search would naturally start. discipline_check() was asked, as the Head Executive Director, about both Directors on screen. It answered 'ok' for both. The refusal came from much further down.

#### `20260914110000_invited_must_mean_an_invitation_was_sent.sql`

*2026-09-14*

"Invited" must mean an invitation was sent.

REPORTED AS: "what happens to this if it was invite, does it automatically send a letter? How come there was no confirm in my mailbox as a Head ED?" The answer was that nothing had been sent, so there was nothing to confirm.

decideRecommendation() set this column and stopped. The row then read INVITED, the Guide who put the name forward saw INVITED, and no invitation row, no account and no email existed. Checked against the live table: the only invitation for that address had been created sixteen days earlier and had expired two days before the button was pressed.

#### `20260914120000_the_head_executive_appointment_needs_no_second_approval.sql`

*2026-09-14*

An appointment by the Head Executive Director needs no second approval.

ASKED FOR DIRECTLY: "Once the head of Executive Director invites there's no need of approval for ED and Directors."

WHAT WAS ALREADY TRUE, AND THE INCONSISTENCY UNDERNEATH IT. handle_new_user already arrived approved for an Explorer and for an Executive Director, and NOT for a Director. Measured rather than read, by walking a real invitation through the trigger for each role inside a transaction that rolled back:

#### `20260915090000_a_private_copy_is_never_published.sql`

*2026-09-15*

A Guide's private working copy is never published to the church.

REPORTED AS: "I deleted this in my guide account and yet it's still here being share in the Explorer." Answered, when asked which way to close it: "a private copy should never be publishable unless it's public."

WHAT THE DELETE ACTUALLY DID, because it was not the bug. Deleting a series you did not write does not remove it -- it writes a hidden copy for you, and restoreLessonSeries is the undo. That worked. What it cannot reach is a DIFFERENT row that is also published.

#### `20260915120000_a_report_is_answered_by_one_person.sql`

*2026-09-15*

A report is answered by one person, and never by the person it is about.

WHAT WAS ASKED FOR. "Guides and Explorers can chat a live Director on it privately 1 on 1, Directors, EDs, and Head ED can participate but only one can chat such case, it wont be a group chat but a one on one chat, basically if a report comes from Guide and Explorer, Directors are the Front line and we'll see it as a report, any Directors can pick up a Guide and Explorer's report, but if a Director misbehave it will be put on trial with EDs and Head ED."

#### `20260916100000_a_pocket_that_follows_you.sql`

*2026-09-16*

A pocket that follows you to any device.

ASKED FOR: "pocket apps should be live too so that the save apps are integrated in the cloud that I can see my apps on aNY devices."

The pocket kept its tiles in the browser, which was the right first answer -- no table, no policy, every role had the feature immediately -- and the wrong final one, because a bookmark saved on a phone did not exist on the laptop, and clearing site data threw the lot away with no warning.

#### `20260916110000_a_notification_goes_where_it_is_about.sql`

*2026-09-16*

A notification goes where it is about.

REPORTED WITH THE SUMMONS CIRCLED IN RED: "when I clicked this notification, it lead me to home page which is misleading cause it didnt lead me to admin room, can please fix this for both guide and explorers."

"You have been called to a trial room" landed somebody on the church home page. The routing table in components/LiveBell.tsx was never wrong -- it has always had a 'trial' case sending anybody who is not leadership to the case room. The notification simply was not labelled one. open_trial wrote 'approval', and 'approval' for a Guide or an Explorer means "your account was approved", which goes to the church screen.

#### `20260916113000_pocket_owner_defaults_to_the_session.sql`

*2026-09-16*

BACKFILLED ON 2026-09-23, NOT WRITTEN THEN.

Applied to the live database as `pocket_owner_defaults_to_the_session` and never committed, so a fresh install's pocket_apps.owner_id had no default.

Everything below the rule is the applied text, byte for byte: its md5 was checked against supabase_migrations.schema_migrations before it was committed. It is already in the live database, which records migrations by the time they ran, so this file changes nothing there. It exists so that a fresh database built from this repository is the same database.

#### `20260916120000_who_may_take_a_seat.sql`

*2026-09-16*

The Hall of Justice: who may take a seat, and who may not.

ASKED FOR: "I (as a Director, ED, Head ED) should have a notification button to both guide and explorer to be summoned on trial ... Any Director, ED, and Head can join the trial room" -- and then, asked back and answered: "yes do that, except trials about themselves or fellow Directors".

HALF OF THIS WAS ALREADY TRUE, AND THAT IS THE PROBLEM. `in_trial` has always had a second branch admitting any approved Director or Executive of the church, so leadership could already read every trial. What it has never had is either exclusion:

#### `20260916130000_the_sidelines_are_not_the_bench.sql`

*2026-09-16*

Watching a hearing is not taking part in it.

CORRECTED BY THE OWNER, and the correction matters: "what I mean ED, Director and Head Director can join is they are on the sidelines and can monitor the hearing. That's all. The only one who accepted the case will be main Judge Director."

The previous migration read "join the trial room" as joining the PROCEEDING and called the part 'bench'. It is not a bench. Leadership may watch; the one who accepted the case runs it. Two things follow, and one of them was a live fault the moment it shipped.

#### `20260916140000_the_next_thing_to_read.sql`

*2026-09-16*

The next thing to read, said by name.

WHY THIS EXISTS. Twenty-one lessons are published in this church and two have been read. Nothing is broken in the library: the pairings are made, nobody is unpaired, nine materials are shared. What was missing is the sentence telling an Explorer what to do when they open the app today. My Journey opened on four folders and none of them opened with a next step, so twenty-one lessons sat behind a folder called Study and waited to be gone looking for.

#### `20260916150000_the_pocket_is_for_tools.sql`

*2026-09-16*

The pocket is for tools, not feeds.

ASKED FOR: "I want to limit (with a disclosure of course to every user) to take our social media apps in the pocket application (Except for Youtube). Facebook, X, Instagram, Tiktok, LinkedIn, etc. are not allowed in the pocket application because it can bring distractions to all users."

WHY THIS IS IN THE DATABASE AND NOT ONLY IN THE BROWSER. Until today the pocket lived in localStorage and a client-side rule would have been the whole of it. It is rows now, and a row can be written by anything holding a session -- so a rule that lives only on the screen is a rule that holds until somebody uses something other than the screen. The browser refuses with an explanation, which is the kind thing; this refuses regardless, which is the true thing.

#### `20260916160000_a_guide_is_told_why_sharing_is_paused.sql`

*2026-09-16*

A Guide is told why sharing is paused, instead of being told nothing.

FOUND BY PROBING THE LIVE DATABASE, not by reading code. A Guide trying to share a resource with their own Explorer was refused outright. The rule doing it was `pairing_can_share_library`, and it was right: an open case about either person in a pairing pauses sharing. What was wrong was everything the Guide could see about it.

The insert failed with a bare row-level-security violation. `humanError` caught that and said:

#### `20260916180000_a_study_room_the_church_owns.sql`

*2026-09-16*

The Explorer's study room: documents the church owns, on its own database.

ASKED FOR: "I want Affine to be the special room for the Explorer right now: Making it more like a real study room for them to use."

WHY THIS TABLE EXISTS AT ALL, which is the part worth reading. AFFiNE's editor -- BlockSuite -- is MIT and embeddable. Its SERVER is not: everything under packages/backend is licensed under the AFFiNE Enterprise Edition licence, which permits production use only under their paid subscription terms. So the editor can come in; the place it keeps documents cannot.

#### `20260916190000_a_study_page_has_a_version.sql`

*2026-09-16*

A study page carries a version, so two devices cannot erase each other.

THE BUG THIS PREVENTS, FOUND BEFORE IT SHIPPED. `study_docs` holds one merged snapshot per page rather than an append-only log, which keeps a 500 MB free tier safe from a study room that grows without a compaction job. The cost of a snapshot is read-merge-write: two devices that read the same row and both write will keep the second write and lose the first edit. Yjs merges cleanly so nothing becomes corrupt -- a sentence somebody wrote simply is not there, which for study notes is worse than an error.

#### `20260916200000_a_device_can_be_told.sql`

*2026-09-16*

Where a device says how to reach it, so a notification can arrive when the app is shut.

REPORTED: "notifications still doesn't work to all devices, can we make it work to all devices please. Find a way to make it happen."

WHAT WAS ACTUALLY WRONG, because "notifications do not work" covers two very different things and only one of them was true. The app already raises real system notifications, and has for a long time. But it raises them ITSELF, in the browser, from data the page already has. That means it can only tell you something while the app is open and running. Close the tab, lock the phone, and nothing can reach you, because nothing is sending: there was no record anywhere of how to reach a device, and nothing that ever tried.

#### `20260916210000_a_notification_leaves_the_building.sql`

*2026-09-16*

A notification reaches the phone, not just the screen it was made on.

REPORTED: "notifications still doesn't work to all devices."

WHY A TRIGGER AND NOT A LINE OF JAVASCRIPT. Every notification in this app is already a row in `notifications`, written from a dozen places: a Guide messages an Explorer, a report is filed, a Director appoints somebody, a study is published. Pushing from the browser would mean finding all dozen and remembering the thirteenth, forever, and would only work when the person who caused the notification happened to have a tab open at the time.

#### `20260917100000_a_pocket_starts_with_something_in_it.sql`

*2026-09-17*

A new member's pocket is not empty on the first day.

ASKED FOR: "please make faithlife as the default (can be removed or add by users too) web app in the pocket app please."

WHY A TRIGGER AND NOT A LINE IN THE SCREEN, which is the whole design and the only part worth arguing about. A default that the app puts back is not a default, it is a nag: somebody who removes a tile has said what they want, and code that seeds "when the pocket is empty" argues with them every time they open the room. There is no way to write that rule on the screen without also needing a record of what has already been given, which is a second source of truth for a bookmark.

#### `20260917120000_a_picture_in_a_study_room_stays.sql`

*2026-09-17*

Somewhere for the bytes: pictures and files in a study room.

ASKED FOR: "I want the whole feature please", with screenshots of AFFiNE's own editor. Images and attachments are part of that, and until now the room kept them in `MemoryBlobSource` -- a JavaScript Map that empties when the tab closes. A photograph of somebody's Bible page would have survived exactly as long as the browser tab did, and looked like a bug on the next visit.

#### `20260917140000_leadership_sees_the_shape_not_the_thing.sql`

*2026-09-17*

Leadership sees what somebody did. It does not see what they did it with.

ASKED FOR, IN THESE WORDS: "Head ED, ED, and Directors can detect the activities (Except for chat) of Guide and Explorer, but the Head ED, ED, and Directors can't see the references. ... Guide put inappropriate website to Explorer, the website can't be seen but the Director can see the label of the activity is not good. Explorer put a malicious web app in the pocket app, the activity is recorded, but the web app address is not seen but labelled malicious and Directors get an alert notification. Once those inappropriate things happen, Head ED, ED, and Directors can file an open case."

#### `20260917150000_a_guide_may_carry_a_hundred.sql`

*2026-09-17*

A hundred, because the owner asked for a hundred.

ASKED FOR: "let's up the limits for Explorers. before there are 5 explorers for 1 guide. Now can we have 100 explorers capacity to 1 guide."

WHAT IS BEING TRADED, SAID ONCE AND THEN NOT ARGUED. Five was never a technical limit; it was a claim about how many people one person can actually walk with, and the whole discipleship shape of this app was built on it. A hundred is a different claim, and it is the church's to make rather than the software's.

#### `20260917160000_an_appointment_can_be_declined.sql`

*2026-09-17*

A yes is recorded. So is a no.

ASKED FOR: "If there is a record for acceptance in appointment, there must be a record for cancel too so that Guides and Explorers are informed who accepted and who declined."

WHAT WAS THERE, AND IT WAS WORSE THAN A MISSING BUTTON. Confirming wrote `status = 'confirmed'`; cancelling wrote `status = 'cancelled'`; and the list on the screen then filtered cancelled ones out. So a Guide who proposed a time and had it called off did not see a refusal. They saw the CARD VANISH, which reads as a bug rather than as an answer, and nobody was told anything either way. The old comment in the screen said the news was carried by "the message in the conversation". No message was ever sent.

#### `20260917170000_leadership_can_see_who_is_walking.sql`

*2026-09-17*

What each Guide and Explorer has actually been doing. Numbers, not a feed.

ASKED FOR: "Head ED, ED, and Directors must have analysis to track Guide and Explorer activities please."

THE FEED ANSWERS "what happened". THIS ANSWERS "who is being walked with and who is not", which is the question a Director actually carries and cannot get by scrolling. Forty rows of events do not say that one Explorer has heard from nobody in three weeks: that person appears in the feed exactly zero times, which is the whole problem, and a list of things that happened can only ever show what is there.

#### `20260923164500_a_suspension_is_immediate.sql`

*2026-09-23*

A suspension takes effect on the next request, not at the next sign-in.

WHAT WAS WRONG, PROVEN RATHER THAN ARGUED. 0026 deletes a suspended person's sessions and refresh tokens and says that puts somebody already signed in "out immediately instead of at token expiry". It does not. The data API checks an access token's signature and its expiry and nothing else -- it never looks at auth.sessions -- so a token issued before the suspension keeps working until it lapses, an hour by default.

#### `20260923173000_a_suspension_reaches_the_socket_too.sql`

*2026-09-23*

A suspension closes the live connection and the file store too.

WHAT 20260923164500 LEFT OPEN, found while checking its own claim. That migration refuses a suspended account on every request to the data API, and taught the five helpers most policies are built on to ask about suspension. But the live connection (Realtime) and the file store (Storage) do not go through the data API's door. They evaluate row security directly -- and most read rules on the tables Realtime broadcasts are built on OTHER helpers: in_pairing, in_trial, may_handle_report, in_report, can_read_material and more, which check approval and not suspension. in_trial, for one, asks may_sit_on_trial, which checks `is_approved` and nothing else.

#### `20260923180000_a_door_compares_the_right_things.sql`

*2026-09-23*

Two doors that compared a column with itself, and so checked nothing.

THE TRAP. Inside a subquery, an unqualified column name binds to the NEAREST relation that has a column of that name -- not to the row the policy is about. So in

exists (select 1 from public.trial_parties tp where tp.trial_id = trial_id and ...)

`trial_id` is tp.trial_id, because trial_parties has one. The line reads as "a party to THIS hearing" and means "a party to ANY hearing". Postgres says so itself: the live policy, deparsed from pg_policies, reads `tp.trial_id = tp.trial_id`. Nothing warns, because it is perfectly valid SQL.

#### `20260923190000_live_matches_the_repository.sql`

*2026-09-23*

The live database, made the same as a fresh one built from this repository.

HOW THIS WAS FOUND. On 23 September 2026 every migration in this repository was applied, in order, to an empty Supabase database (the same Postgres 17.6 image Supabase runs), and the result was compared with the live database object by object: 59 tables, 459 columns, 297 constraints, 141 indexes, 175 functions, 188 row rules, 41 triggers, every grant, the storage bucket and the realtime publication. Once comments and line breaks were set aside -- the tool that applied most live migrations strips comments from function bodies, which changes nothing a function does -- six things differed. This restates the repository's version of each, so both are the same.

#### `20260923200000_the_rules_ask_once.sql`

*2026-09-23*

The read rules ask "who am I?" once per request, not once per row.

WHAT WAS SLOW, MEASURED ON THE LIVE DATABASE ON 23 SEPTEMBER 2026. pg_stat_statements put reads of `profiles` at the top of the whole app: about 94 ms on average across 13,500 requests, some over 700 ms -- for a table of 43 rows. `pairings` averaged 45 ms. Timed warm, server side, as a Director, a Guide and an Explorer:

profiles 23-30 ms messages 14 ms (even with nothing to see) materials 12-22 ms pairings 8-10 ms notifications 0.4 ms -- the one rule that simply compares a column

#### `20260924100000_a_guide_can_ask_for_prayer_too.sql`

*2026-09-24*

A Guide can ask the people they walk with to pray for them, too.

WHAT WAS ASKED FOR: "a feature where both Guide and Explorer can pray [for] each other". Until now prayer ran one way. An Explorer asked, their Guide said "I am praying for this", and the Explorer was told. A Guide carrying something of their own had nowhere to put it.

THE SHAPE. A request still lives with ONE relationship, and `ds_id` still names the Explorer in it. What is new is `author_id`, who wrote it:

#### `20260925100000_a_resource_can_be_a_file.sql`

*2026-09-25*

A resource can be a file, not only a link.

WHAT WAS ASKED, 25 September 2026: "I cant even upload files in the resources but I can do that in the Library for all users ... files must be drag and drop please, and easy to share for all users ... easy to add, easy to delete."

WHY IT WAS NOT POSSIBLE. The library was links only, on purpose: My Files ("On this device") keeps a file in the phone that saved it, and a file on one phone cannot be opened on another. So a Guide could keep a handout for themselves but never put it in front of the person they walk with -- except by attaching it to a study, which goes through the church's own storage and always has. This does the same for resources.

#### `20260925120000_what_one_person_can_upload.sql`

*2026-09-25*

What one person can put in the church's storage.

WHAT WAS ASKED, 25 September 2026: "Make sure to update policy and security to keep our app consistent and safe", straight after Resources were opened to files (20260925100000). Two things were not consistent.

1. NOTHING LIMITED HOW MUCH ONE PERSON COULD UPLOAD. Every file is capped at 10 MB by the bucket, but not the number of them. Resources now take files from every Guide and Explorer, and a single account -- somebody's stolen password, or a script driving one -- could fill the church's storage one 10 MB file at a time, and the church would find out from the bill. On the day this was written the most anybody had stored was three files.

#### `20260927100000_a_folder_does_not_say_whose_church.sql`

*2026-09-27*

A folder does not say whose church it is to somebody outside that church.

FOUND IN THE AUDIT OF 27 SEPTEMBER 2026. `public.uploader_church(folder)` turns the first part of a stored file's path (a person's id) into that person's church. The storage rules need exactly that. But the function is also callable on its own, by any signed-in member, with any id at all:

POST /rest/v1/rpc/uploader_church {"p_folder": "<anybody's id>"}

#### `20260929100000_an_invitation_password_runs_out.sql`

*2026-09-29*

The password an invitation e-mails runs out, and only that password.

ASKED ON 29 SEPTEMBER 2026, in these words:

"If access to user's password is changed, can I still access the account in the invitation letter? Hackers might exploit that system in the long run if they saw the code in the open source code. We must find a better security system where the user is in control with it's data and password security even if everyone can the the open source code and systems."

#### `20260929130000_an_ended_session_ends_at_once.sql`

*2026-09-29*

An ended session is refused at once, not up to an hour later.

WHAT WAS TRUE. Signing out everywhere else, choosing a password, and an invitation's week running out all delete the session on the server, so no device can RENEW its sign-in. But the pass a device already held (an access token, good for an hour) kept working until it expired: the data API, the live socket and the file store check that a token is genuine and unexpired, not that its session still exists. docs/SECURITY.md said so under "What is not protected", and the owner asked, on 29 September 2026, for what could be improved to be improved.

#### `20261001120000_a_conversation_can_reply_react_and_speak.sql`

*2026-10-01*

A conversation can reply, react and speak.

ASKED FOR ON 1 OCTOBER 2026, with a screenshot of the chat: "Can we improve the chat more to be modern looking and functional as well ... most people are digital natives. All users should feel familiar and welcoming." Chosen from the options put to the owner: reactions, replying to a message, and voice messages. Three things every messaging app people already use does, each built here on the one rule that has always governed this table:

#### `20261002150000_office_plans_follow_you.sql`

*2026-10-02*

Sabbath programs and evangelistic meetings follow their owner to every device they sign in on.

ASKED FOR on 2 October 2026: "make sure it's on device first, but ALSO it's transparent to go to other devices that is login so our app is flexible to use." Until now both lived only in the browser where they were made.

DEVICE FIRST STILL. The browser keeps the working copy, saves as it is typed, works with no signal, and works on a database without this table at all (lib/live/office-plans.ts reads a missing table as "not here yet"). This is the account's copy behind it: pushed when there is a signal, pulled when another device changed something, the newest edit of each item winning.

#### `20261003120000_an_office_plan_has_a_size.sql`

*2026-10-03*

An office plan has a size, and only an approved member keeps one.

FOUND BY THE AUDIT OF 3 OCTOBER 2026. 20261002150000_office_plans_follow_you let one account keep 1,000 plans of up to 400 KB each: about 400 MB, close to everything a free Supabase project holds. One account could have filled the church's database and made it read-only for everybody. And its rules asked only "is this row yours?", not "are you an approved member?".

#### `20261003130000_an_invitation_password_lasts_three_days.sql`

*2026-10-03*

An invitation password lasts three days, not seven.

CHOSEN BY THE OWNER ON 3 OCTOBER 2026, after that day's security audit: "do both options for the password". The password an invitation e-mails is now three words and a number (supabase/functions/invite/password.ts), and it lasts three days. Anybody who can read that mailbox can sign in until the person chooses their own password; a shorter window is less time for that, and less time for anybody guessing.
