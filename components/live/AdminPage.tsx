'use client';

import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { MinorBadge } from '@/components/MinorBadge';
import { copyText } from '@/lib/share';
import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_ROSTER } from '@/lib/live/keep-up';
import { roleNoun, stageInfo, APP_SHORT_NAME } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';

/**
 * A day, for the pairing record. Short, and it carries the year only when it is
 * not this one -- a roster stamped 2026 on every line reads as noise.
 */
function onDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], {
    day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }),
  });
}
import { LiveReportsForDirector } from '@/components/LiveSafeguarding';
import { LiveTrialRoom, LiveCourt } from '@/components/LiveTrialRoom';
import { LiveGuilds, LiveChurchPulse } from '@/components/LiveGuilds';
import { LiveSecurityAudit } from '@/components/LiveSecurityAudit';
import { LiveFeedbackInbox } from '@/components/LiveFeedbackInbox';
import { LiveLibraryRecord } from '@/components/LiveLibraryRecord';
import type { Profile, Role } from '@/lib/types';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveLibraryForGuide } from '@/components/LiveLibrary';
import { LiveChurchOverview, LiveBoardReport } from '@/components/LiveExecutive';
import { LiveRecommendationsForDirector } from '@/components/LiveMinistry';
import { LiveStudies } from '@/components/LiveStudies';
import { LiveBulkInvite } from '@/components/LiveBulkInvite';
import { NewBadge } from '@/components/NewBadge';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Avatar, Button, Card } from '@/components/ui';
import { Field, Notice, SelectPerson, emailLooksValid, errorText } from '@/components/live/shared';
import { humanError } from '@/lib/live/errors';
import { LiveAnnouncements } from '@/components/LiveAnnouncements';
import { MemberProfile } from '@/components/live/MemberProfile';

// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

export function LiveAdminPage() {
  const { profile } = useLiveSession();
  const [members, setMembers] = useState<Profile[]>([]);
  const [pairings, setPairings] = useState<live.PairingView[]>([]);
  const [church, setChurch] = useState<live.Church | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('dm');
  const [guideId, setGuideId] = useState('');
  const [dmId, setDmId] = useState('');
  const [dsId, setDsId] = useState('');
  const [busy, setBusy] = useState('');
  // Set when the invitation could not be emailed and must be passed on by hand.
  const [handLink, setHandLink] = useState<
    { to: string; url: string; why: string; wait?: number; pass?: string } | null
  >(null);
  // '' not tried, 'yes' copied, 'failed' the clipboard refused. Safari rejects
  // the write when the document is not focused, and navigator.clipboard does
  // not exist at all over plain http. The link is in a selectable box right
  // above, so a failure has somewhere useful to point.
  const [linkCopied, setLinkCopied] = useState<'' | 'yes' | 'failed'>('');

  // Finding one person in a list of thirty-seven. Kept in the component rather
  // than the URL: it is a way of looking, not a place you would want to return
  // to or send to somebody else.
  const [findApproved, setFindApproved] = useState('');
  // Deleting is permanent, so it takes two taps in the row itself rather than a
  // browser confirm. A confirm() dialog on a phone lands under the thumb that
  // just tapped Delete, and the button that dismisses it is the one that agrees.
  const [confirmDelete, setConfirmDelete] = useState('');
  // Bulk selection, held as ids rather than as a flag on each row, so the set
  // survives the list being re-sorted or re-filtered under it.
  const [picked, setPicked] = useState<string[]>([]);
  // '' none pending, 'disapprove' or 'delete' waiting on the second press.
  const [bulkAsk, setBulkAsk] = useState<'' | 'disapprove' | 'delete'>('');
  // What happened to each person in the last batch. A batch that reports one
  // number hides the one refusal that mattered.
  const [bulkResult, setBulkResult] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextMembers, nextPairings, nextChurch] = await Promise.all([
        live.listMembers(),
        live.listPairings(),
        live.myChurch(),
      ]);
      setMembers(nextMembers);
      setPairings(nextPairings);
      setChurch(nextChurch);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  // WHO IS OPEN. One at a time: a Director comparing two people opens one, reads
  // it, closes it and opens the other, which is also the only shape that fits a
  // phone. The panel is rendered next to the list rather than over it so the
  // row they came from stays visible.
  const [openId, setOpenId] = useState('');
  const [contact, setContact] = useState<Record<string, { email: string; joined_at: string }>>({});

  useEffect(() => {
    void load();
  }, [load]);
  // Approvals, invitations and pairings, as they happen. A Director watching
  // this during a launch was the person most often told to refresh.
  useKeepUp(KEEP_UP_ROSTER, load);

  // The address somebody was invited at and the day they arrived are the two
  // facts that answer "is this the person I meant to let in?", and neither is
  // on the profile row. Leadership only, by the same function the roster uses.
  useEffect(() => {
    live.memberContact().then(setContact).catch(() => setContact({}));
  }, []);

  const openPerson = members.find((m) => m.id === openId) ?? null;
  // The other half of their pairing, so the compatibility panel has something
  // to compare against.
  const openPartner = (() => {
    if (!openPerson) return null;
    const pairing = pairings.find(
      (x) => x.status === 'active' && (x.dm_id === openPerson.id || x.ds_id === openPerson.id),
    );
    if (!pairing) return null;
    const otherId = pairing.dm_id === openPerson.id ? pairing.ds_id : pairing.dm_id;
    return members.find((m) => m.id === otherId) ?? null;
  })();

  // An Executive Director may appoint their own bench, which is why
  // 'executive' is here and why the edge function refuses it from anybody
  // else. A Director invites Guides and Explorers only.
  const roleOptions: Role[] = profile?.role === 'executive'
    ? ['executive', 'admin', 'dm', 'ds']
    : ['dm', 'ds'];
  const guides = members.filter((member) => member.role === 'dm' && member.is_approved);
  const explorers = members.filter((member) => member.role === 'ds' && member.is_approved);
  const manageable = members.filter(
    (member) => member.id !== profile?.id && roleOptions.includes(member.role),
  );
  const pending = manageable.filter((member) => !member.is_approved);
  const approved = manageable.filter((member) => member.is_approved);
  // Matching is on the name a Director reads on the row. Case and surrounding
  // spaces are ignored, because a name copied out of an email carries both.
  const approvedNeedle = findApproved.trim().toLowerCase();
  const approvedShown = approvedNeedle
    ? approved.filter((member) => (member.full_name || '').toLowerCase().includes(approvedNeedle))
    : approved;
  // Only the rows on screen. Select-all and its half-ticked state both mean
  // "of what you can see", never "of everything the filter is hiding".
  const pickedShown = approvedShown.filter((member) => picked.includes(member.id));
  // Directors are their own room, and only an Executive has one. A Director
  // does not manage other Directors, so showing them the tab would be a room
  // with nothing they can do in it.
  const directors = members.filter((member) => member.role === 'admin' && member.is_approved);
  const isExec = profile?.role === 'executive';

  // ROOMS, IN THE ORDER A DIRECTOR ACTUALLY WORKS. See docs/DESIGN.md rule 1:
  // the room needed most often is the first one. Pairing and approving happen
  // weekly; the board report is read once a month. Pairing used to be the ninth
  // section down one long page.
  const rooms: Room[] = [
    { id: 'pairings', label: 'Pairings', badge: pairings.filter((x) => x.status === 'active').length },
    { id: 'approvals', label: 'Approvals', badge: pending.length, urgent: pending.length > 0 },
    { id: 'guides', label: 'Guides', badge: guides.length },
    { id: 'explorers', label: 'Explorers', badge: explorers.length },
    ...(isExec ? [{ id: 'directors', label: 'Directors', badge: directors.length }] : []),
    { id: 'lessons', label: 'Lessons' },
    { id: 'safeguarding', label: 'Safeguarding' },
    { id: 'security', label: 'Security' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'church', label: 'Church' },
  ];
  // Stored per role, so a Director and an Executive keep their own places.
  const [room, chooseRoom] = useRoom(rooms, `beacon-admin-room:${profile?.role ?? 'admin'}`);

  useEffect(() => {
    if (!roleOptions.includes(role)) setRole(roleOptions[0]);
  }, [roleOptions, role]);

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !emailLooksValid(email)) return;
    setBusy('invite');
    setError('');
    setNotice('');
    try {
      const result = await live.inviteMember({
        fullName: name,
        email,
        role,
        recommendedBy: role === 'ds' && guideId ? guideId : undefined,
      });
      const to = email.trim().toLowerCase();

      // TELL THE TRUTH ABOUT WHAT HAPPENED. This said "Invitation e-mail sent"
      // unconditionally, including when the function had reported that it could
      // not send anything. Invitations went nowhere for a day while the screen
      // said they had gone — and the one thing that would have made it obvious,
      // the link the function hands back for exactly this case, was thrown away
      // one layer down.
      if (result.delivery === 'link' && result.link) {
        setHandLink({
          to, url: result.link, why: result.mailNote ?? '',
          wait: result.waitSeconds, pass: result.tempPassword,
        });
        setNotice('');
      } else {
        // KEEP THE LINK ON SCREEN EVEN ON SUCCESS. Supabase builds the link in
        // its own email from the project's Site URL, and if the app's address
        // is not in the Redirect URLs allow-list that is silently ignored — a
        // project on its defaults mails everybody a link to localhost:3000. The
        // send reports success, the link is useless, and nothing in the result
        // says so. This link is built by our own invite function from the
        // church's own configured address, so it is correct whatever the
        // provider dashboard holds.
        setHandLink(result.link
          ? { to, url: result.link, why: 'sent', pass: result.tempPassword }
          : null);
        // Say WHERE it went and BY WHICH ROUTE. "Sent" on its own is the
        // message this screen showed all day while nothing was being sent, so
        // it has to carry something only a real send could produce.
        const how = result.via === 'supabase'
          ? ' It went through Supabase\u2019s own mail service, so it will look plain.'
          : '';
        setNotice(
          (result.resent
            ? `\u2713 Invitation link re-sent to ${to}.`
            : `\u2713 Invitation link sent to ${to}.`) + how,
        );
      }
      setName('');
      setEmail('');
      setGuideId('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  const approve = async (member: Profile) => {
    setBusy(member.id);
    setError('');
    try {
      await live.approveMember(member.id, member.role);
      setNotice(`${member.full_name || 'Member'} approved as ${roleNoun(member.role)}.`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  const disapprove = async (member: Profile) => {
    if (!window.confirm(`Disapprove ${member.full_name || 'this account'}? They will lose workspace access until approved again.`)) return;
    setBusy(member.id);
    setError('');
    setNotice('');
    try {
      await live.disapproveMember(member.id);
      setNotice(`${member.full_name || 'Member'} no longer has workspace access.`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  // DELETE, WHICH IS NOT DISAPPROVE.
  //
  // Disapprove switches an account off and keeps it. Delete removes the auth
  // user, and because every table hangs off that row, the person leaves the
  // system entirely -- including their address, which is the point. Until this
  // existed, an address that had ever been invited could never be invited
  // again: the account stayed in auth.users where no screen could see it, and
  // a fresh invitation to the same person was refused as already registered.
  //
  // WHO MAY DELETE WHOM IS DECIDED IN THE DATABASE, not here. remove_member_by_
  // leader runs discipline_check first (migration 0023): an Executive may act
  // on anyone in a church they oversee, a Director on Guides and Explorers
  // only, nobody on themselves, and nobody at all on the Head Executive
  // Director. It returns a sentence when it refuses, which is shown as-is.
  //
  // The act is recorded. remove_member_by_leader writes to discipline_log
  // before it deletes, and that entry outlives the person it describes
  // (migration 0028) -- so a church can always answer who removed whom.
  const deleteAccount = async (member: Profile) => {
    setBusy(member.id);
    setError('');
    setNotice('');
    try {
      const verdict = await live.removeMemberByLeader(member.id);
      if (verdict !== 'ok') { setError(verdict); return; }
      setNotice(
        `${member.full_name || 'That account'} was deleted. Their email address is `
        + 'free again, so you can invite them as a new member whenever you want.',
      );
      setConfirmDelete('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  // ACTING ON SEVERAL PEOPLE AT ONCE, ONE PERSON AT A TIME UNDERNEATH.
  //
  // There is no bulk endpoint and there should not be. Every rule that governs
  // a single removal -- who may act on whom, the discipline log, freeing the
  // address -- lives in the database function, and a batch call would have to
  // reimplement all three. So the batch is a loop over the same call.
  //
  // ONE REFUSAL MUST NOT UNDO THE REST. A Director selecting twelve people and
  // catching one refusal on a Director they may not touch should still have
  // acted on the other eleven, and should be told exactly which one failed.
  // Reporting "12 accounts" and meaning eleven is how trust in a bulk action
  // goes, permanently.
  const runBulk = async (what: 'disapprove' | 'delete') => {
    const people = approved.filter((member) => picked.includes(member.id));
    if (people.length === 0) return;
    setBusy('bulk');
    setError('');
    setNotice('');
    const done: string[] = [];
    const failed: string[] = [];
    for (const member of people) {
      const who = member.full_name || 'An account';
      try {
        if (what === 'delete') {
          const verdict = await live.removeMemberByLeader(member.id);
          if (verdict !== 'ok') { failed.push(`${who}: ${verdict}`); continue; }
        } else {
          await live.disapproveMember(member.id);
        }
        done.push(who);
      } catch (cause) {
        failed.push(`${who}: ${errorText(cause)}`);
      }
    }
    setBulkResult(failed);
    if (done.length > 0) {
      setNotice(
        what === 'delete'
          ? `${done.length} ${done.length === 1 ? 'account was' : 'accounts were'} deleted. `
            + 'Their email addresses are free again.'
          : `${done.length} ${done.length === 1 ? 'account' : 'accounts'} no longer have workspace access.`,
      );
    }
    if (failed.length > 0) {
      setError(`${failed.length} could not be done. See below.`);
    }
    setPicked([]);
    setBulkAsk('');
    setBusy('');
    await load();
  };

  const pair = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dmId || !dsId) return;
    setBusy('pair');
    setError('');
    try {
      await live.createPairing(dmId, dsId, 'digital');
      setNotice('Guide and Explorer paired at Connect.');
      setDmId('');
      setDsId('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  return (
    <LiveAppShell allow={['admin', 'executive']}>
      <div className="space-y-4">
        {/* SMALLER THAN IT WAS, and the sentence under it is gone. It read
            "Invite, approve, disapprove and pair people", which is exactly what
            the room names below now say, and it said it again on every visit.
            On a 664px phone that block plus the header spent 300px before a
            Director could reach anything they came to do. */}
        <h1 className="text-2xl font-extrabold text-room sm:text-3xl">
          {church?.name || 'Church administration'}
        </h1>

        {/* ABOVE THE ROOMS, and only while somebody is open. A panel below a
            long roster is one a Director scrolls past without seeing, and they
            have just pressed a name expecting something to happen. It is not
            allowed to displace the room tabs permanently — it is here only when
            it was asked for, and Close puts everything back. */}
        {openPerson && (
          <MemberProfile
            person={openPerson}
            email={contact[openPerson.id]?.email}
            joinedAt={contact[openPerson.id]?.joined_at}
            pairedWith={openPartner}
            members={members}
            canManage
            onChanged={() => void load()}
            onClose={() => setOpenId('')}
          />
        )}

        {/* THE ROOMS COME FIRST, above even a safeguarding alert, and that
            ordering is deliberate. docs/DESIGN.md rule 1: the second visit
            should be faster than the first, which only works if the way around
            the building is in the same place every time. Put an alert above
            them and the tabs move down on the days something is wrong -- which
            are the days a Director can least afford to go looking. */}
        <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}

        {/* FIRST CONTENT, AND STILL BELOW THE TABS. The tabs do not move, for
            the reason written above them: put anything above them and the way
            around the building shifts on exactly the days a Director can least
            afford to go looking.

            Above the safeguarding alert on an ordinary day, because it draws
            nothing when there is nothing pinned — and below it on the rare day
            something is open, which is the right way round. A pinned notice
            must never sit on top of a report somebody has made. */}
        <LiveAnnouncements hideWhenEmpty />

        {/* ABOVE THE ADMIN WORK, NOT BELOW IT. A safeguarding report that sits
            under invitations and pairings gets read at the pace of invitations
            and pairings. It renders nothing at all when there is nothing open,
            so it costs a Director no attention on an ordinary day. */}
        <LiveReportsForDirector
          onRemove={async (id, who) => {
            if (!confirm(
              `Remove ${who} from the church permanently? Their account, messages `
              + 'and pairings go. The record of this stays, and their email address '
              + 'is freed so they could be invited again.',
            )) return;
            try {
              // The RPC, not the plain profile delete this used to call. A
              // deleted profile left the auth account behind where no screen
              // could reach it, so somebody removed after a safeguarding report
              // still held a login and their address could never be invited
              // again. It also refuses rather than throwing when a Director
              // lacks the authority, so a refusal is a sentence to show.
              const verdict = await live.removeMemberByLeader(id);
              if (verdict !== 'ok') { setError(verdict); return; }
              setNotice(`${who} was removed from the church.`);
              await load();
            } catch (cause) {
              setError(humanError(cause, 'Could not remove them.'));
            }
          }}
        />

        {/* GUIDES AND EXPLORERS ARE SEPARATE ROOMS, not one roll to scroll.
            They are different jobs: a Guide has a load and a cap, an Explorer
            has a Guide and a stage. Reading one long list and sorting people
            in your head is work the app should have done. Directors get their
            own room too, and only an Executive sees it, because a Director does
            not manage other Directors. */}
        {(room === 'guides' || room === 'explorers' || room === 'directors') && (
          <PeopleRoom
            people={room === 'guides' ? guides : room === 'explorers' ? explorers : directors}
            kind={room}
            pairings={pairings}
            onOpen={setOpenId}
          />
        )}

        {/* SAFEGUARDING, IN THE ORDER A DIRECTOR MEETS IT: what has been
            reported, then the cases arising from it, then the room where a
            case is opened or somebody is stopped on the spot. Putting the
            trial room first would offer the punishment before the hearing. */}
        {/* A Director sees the cases they are judging here, beside the reports
            they come from. This is not a duplicate of the /cases room: that one
            is where a person answers a case they were called to, and this is
            where a head judge works through the ones they opened. Both call the
            same component because the component already tells those two jobs
            apart by whether the reader leads the church. */}
        {room === 'safeguarding' && profile && <LiveCourt me={profile} />}
        {room === 'safeguarding' && profile && (
          <LiveTrialRoom
            me={profile}
            onCaseOpened={() => {
              // A case opened below appears in Cases above, which loads its own
              // list. Reloading the page data here keeps the member list and the
              // pairing list honest after a suspension archived somebody.
              void load();
            }}
          />
        )}

        {/* THE SECURITY ROOM HOLDS BOTH RECORDS, because they answer the same
            question a week apart: the audit says what happened to accounts, and
            the library record says what people sent each other. A Director
            looking into somebody reads both, and two doors for one errand is
            one door too many.

            Who appears in each is decided in the database. A Director reads the
            library record for Guides and Explorers; an Executive Director reads
            it for Directors and sees nothing about a Guide or an Explorer. */}
        {room === 'feedback' && <LiveFeedbackInbox />}

        {room === 'security' && (
          <>
            <LiveSecurityAudit />
            <LiveLibraryRecord audience={profile?.role === 'executive' ? 'executive' : 'admin'} />
          </>
        )}

        {/* Guilds and the church-wide numbers. Both are a Director's job as
            much as an Executive's -- a Director who cannot see their own
            church's totals cannot run it. */}
        {room === 'church' && profile && <LiveGuilds me={profile} />}
        {room === 'church' && <LiveChurchPulse />}
        {/* THE NUMBERS, THE DOWNLOADS AND THE WRITING MOVED TO THE OFFICE.
            They were three clicks inside an admin tab, which is not where
            anybody looks for the thing they open on a Tuesday morning. This
            room keeps what it is for: the state of the church and its guilds.
            See app/office/page.tsx. */}

        {/* THE LIBRARY BELONGS TO DIRECTORS TOO.
            The tutorial's Director walk ends on "Stock the library", and live
            it existed only on the Guide's page — so somebody who learned the
            job in the demo signed in and found the last thing they were taught
            was missing. Passing no pairings gives add-and-publish without the
            per-Explorer share buttons, which is right: stocking the shelf is a
            Director's job, handing a book to one person is a Guide's. */}
        {room === 'lessons' && <LiveLibraryForGuide pairings={[]} />}

        {room === 'approvals' && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Send an invitation e-mail</h2>
          <p className="mt-1 text-sm text-gray-500">The chosen role comes from the server-side invitation record.</p>
          {handLink && (
            // A church that has not set up a mail provider yet is a normal
            // state, and it must not be a dead end. The account and the link
            // are real and work exactly once; the only thing missing is the
            // postman, so the Director becomes the postman.
            <div className={`mt-4 rounded-2xl p-4 ring-1 ${
              handLink.wait
                ? 'bg-blue-50 ring-blue-300'
                : handLink.why === 'sent'
                  ? 'bg-green-50 ring-green-300'
                  : 'bg-amber-50 ring-amber-300'
            }`}>
              {/* A COOLDOWN AND A FAULT ARE DIFFERENT THINGS and must not look
                  the same. One means "wait a moment"; the other means "go and
                  change a setting". Drawn identically, a sixty-second timer
                  reads as the email system failing again. */}
              <p className={`font-bold ${
                handLink.wait ? 'text-blue-900' : handLink.why === 'sent' ? 'text-green-900' : 'text-amber-900'
              }`}>
                {handLink.wait
                  ? `Nearly there. Wait ${handLink.wait} seconds, then press Send once`
                  : handLink.why === 'sent'
                    ? 'Their sign-in details, in case the e-mail does not arrive'
                    : `Pass these to ${handLink.to} yourself`}
              </p>
              <p className={`mt-1 text-sm ${
                handLink.wait ? 'text-blue-800' : handLink.why === 'sent' ? 'text-green-800' : 'text-amber-800'
              }`}>
                {handLink.why === 'sent'
                  ? 'Worth keeping. The app built this one itself, so it is correct even if the address in the e-mail is not.'
                  : handLink.why || 'No email service is set up on this project yet.'}
              </p>
              <p className={`mt-1 text-sm ${
                handLink.wait ? 'text-blue-800' : handLink.why === 'sent' ? 'text-green-800' : 'text-amber-800'
              }`}>
                The account is ready. Nothing here expires, and it can be used as
                often as they need.
              </p>

              {/* THE PASSWORD, WHERE A DIRECTOR CAN READ IT DOWN A PHONE LINE.
                  This is the call that used to end in "I'll send you another
                  one" -- which, while invitations carried a one-time token,
                  killed the message already sitting in their inbox. Now there
                  is nothing to kill and nothing to re-send: the two facts on
                  screen are the two facts in the e-mail. */}
              {handLink.pass && (
                <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-black/10">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">E-mail</p>
                  <p className="break-all font-mono text-sm font-bold text-navy">{handLink.to}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-500">Password</p>
                  <p className="break-all font-mono text-lg font-bold text-navy">{handLink.pass}</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    All small letters, with the dashes. Ask them to change it once
                    they are in, under Settings, then Password.
                  </p>
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const done = await copyText(
                          `${APP_SHORT_NAME}\nE-mail: ${handLink.to}\nPassword: ${handLink.pass}\nSign in: ${handLink.url}`,
                        );
                        setLinkCopied(done ? 'yes' : 'failed');
                      }}
                    >
                      Copy all of it
                    </Button>
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={handLink.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`tap min-w-0 flex-1 rounded-xl bg-white px-3 text-sm ring-1 ${
                    handLink.wait
                      ? 'ring-blue-300'
                      : handLink.why === 'sent' ? 'ring-green-300' : 'ring-amber-300'
                  }`}
                />
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const done = await copyText(handLink.url);
                    setLinkCopied(done ? 'yes' : 'failed');
                  }}
                >
                  {linkCopied === 'yes'
                    ? '✓ Copied'
                    : linkCopied === 'failed'
                      ? 'Select the box above'
                      : 'Copy link'}
                </Button>
                <Button variant="ghost" onClick={() => setHandLink(null)}>Done</Button>
              </div>
            </div>
          )}

          <form onSubmit={sendInvite} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Full name" value={name} onChange={setName} />
            <Field label="E-mail" type="email" value={email} onChange={setEmail} />
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
              >
                {roleOptions.map((option) => <option key={option} value={option}>{roleNoun(option)}</option>)}
              </select>
            </label>
            {role === 'ds' && (
              <div className="block">
                {/* NOT "after approval" any more, because for an Explorer there is
                    no approval step: an invitation IS the approval, so choosing
                    a Guide here pairs them the moment they finish signing up.
                    The old label described a wait that does not happen. */}
                {/* THE SHARED PICKER, not a second hand-rolled select.
                    This was its own <select> listing every Guide, so when the
                    pairing screen's pickers learned to be typed into, this one
                    -- which is the SAME decision, made a week earlier -- did
                    not. A Director inviting an Explorer still scrolled thirty
                    nine names. One component, one behaviour, and "Pair later"
                    survives as the empty choice because here it is a real
                    answer rather than a thing left undone. */}
                <SelectPerson
                  label="Guide to walk with (optional)"
                  value={guideId}
                  onChange={setGuideId}
                  people={guides}
                  noneLabel="Pair later"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  {guideId
                    ? 'They will be walking with this Guide as soon as they finish signing up.'
                    : 'You can pair them later on the Pairings screen.'}
                </span>
              </div>
            )}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                variant="gold"
                disabled={busy === 'invite' || !name.trim() || !emailLooksValid(email)}
              >
                {busy === 'invite' ? 'Sending…' : 'Send invitation'}
              </Button>
            </div>
          </form>
        </Card>

        )}

        {/* BULK, UNDER THE SINGLE FORM. One at a time is right for the usual
            case and hopeless for twenty-five, which is a real Sunday. */}
        {room === 'approvals' && <LiveBulkInvite roles={roleOptions} />}

        {room === 'approvals' && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-navy">Approved accounts</h2>
              <p className="text-sm text-gray-500">
                Disapprove switches an account off and keeps it. Delete removes
                the person and frees their email address.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{approved.length}</span>
          </div>

          {/* SEARCH, once the list is longer than a screen. Below five rows a
              box is one more thing to read on the way to the row you can
              already see; at thirty-seven it is the only way to reach one
              person without scrolling past thirty-six others. */}
          {approved.length > 5 && (
            <div className="mt-4">
              <input
                value={findApproved}
                onChange={(event) => setFindApproved(event.target.value)}
                type="search"
                inputMode="search"
                placeholder="Search by name"
                aria-label="Search approved accounts by name"
                className="tap w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
              />
              {approvedNeedle && (
                <p className="mt-1.5 text-sm text-gray-500">
                  {approvedShown.length} of {approved.length}
                  {approvedShown.length === 0 && ' · nobody by that name'}
                </p>
              )}
            </div>
          )}

          {/* SELECT ALL MEANS ALL OF WHAT YOU CAN SEE, not all of everything.
              With a search of "ma" showing four rows, a box labelled Select all
              that quietly took thirty-seven is the difference between
              disapproving four people and disapproving a church. */}
          {approvedShown.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-navy">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pickedShown.length === approvedShown.length && approvedShown.length > 0}
                  ref={(node) => {
                    // Some are picked, but not all. The browser has a third
                    // state for exactly this and it has to be set in code.
                    if (node) node.indeterminate =
                      pickedShown.length > 0 && pickedShown.length < approvedShown.length;
                  }}
                  onChange={(event) => {
                    const shown = approvedShown.map((m) => m.id);
                    setPicked((prev) => (event.target.checked
                      ? [...new Set([...prev, ...shown])]
                      : prev.filter((id) => !shown.includes(id))));
                  }}
                />
                {approvedNeedle ? `Select these ${approvedShown.length}` : 'Select all'}
              </label>
              {picked.length > 0 && (
                <>
                  <span className="text-sm text-gray-500">{picked.length} selected</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      disabled={busy === 'bulk'}
                      onClick={() => setBulkAsk('disapprove')}
                    >
                      Disapprove selected
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy === 'bulk'}
                      onClick={() => setBulkAsk('delete')}
                    >
                      Delete selected
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* THE SECOND PRESS NAMES EVERY PERSON. "Delete 12 accounts?" is not
              a confirmation, it is a number: nobody can tell from it whether
              the twelve are the twelve they meant. Deleting cannot be undone,
              so the list is spelled out before it happens. */}
          {bulkAsk && picked.length > 0 && (
            <div className={`mt-3 rounded-xl p-3 ring-1 ${
              bulkAsk === 'delete' ? 'bg-red-50 ring-red-200' : 'bg-amber-50 ring-amber-200'
            }`}>
              <p className={`text-sm font-bold ${bulkAsk === 'delete' ? 'text-red-900' : 'text-amber-900'}`}>
                {bulkAsk === 'delete'
                  ? `Delete ${picked.length} ${picked.length === 1 ? 'account' : 'accounts'} permanently?`
                  : `Disapprove ${picked.length} ${picked.length === 1 ? 'account' : 'accounts'}?`}
              </p>
              <p className={`mt-1 text-sm ${bulkAsk === 'delete' ? 'text-red-800' : 'text-amber-800'}`}>
                {approved.filter((m) => picked.includes(m.id))
                  .map((m) => m.full_name || 'Unnamed account').join(', ')}
              </p>
              <p className={`mt-1 text-sm ${bulkAsk === 'delete' ? 'text-red-800' : 'text-amber-800'}`}>
                {bulkAsk === 'delete'
                  ? 'Their accounts, messages and pairings go and cannot be brought back. Their email addresses are freed, so they can be invited again later.'
                  : 'They keep their accounts and history, and cannot enter until you approve them again.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className={bulkAsk === 'delete'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-amber-600 text-white hover:bg-amber-700'}
                  disabled={busy === 'bulk'}
                  onClick={() => void runBulk(bulkAsk)}
                >
                  {busy === 'bulk'
                    ? 'Working…'
                    : bulkAsk === 'delete' ? 'Yes, delete them all' : 'Yes, disapprove them'}
                </Button>
                <Button variant="ghost" onClick={() => setBulkAsk('')}>Cancel</Button>
              </div>
            </div>
          )}

          {/* PER PERSON, NOT PER BATCH. A refusal names who and why, so a
              Director can act on it rather than re-running the whole batch. */}
          {bulkResult.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <p className="font-bold">Not everybody could be done:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {bulkResult.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => setBulkResult([])}
                className="mt-2 text-xs font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* A LIST OF ITS OWN, WITH ITS OWN SCROLL BAR.
              Forty accounts is roughly four thousand pixels of page. Every
              control above this — the search box, Select all, Disapprove
              selected, Delete selected — scrolled away the moment somebody
              started looking through the names, so choosing the eighth person
              meant scrolling back up to find the button. Capping the height
              keeps the roll and the things you do to it on the screen at the
              same time.

              `max-h` with `overflow-y-auto`, not a fixed height: a church with
              four accounts gets a four-row box rather than an empty well.
              `overscroll-contain` stops the page underneath from scrolling on
              when this list reaches its end, which on a phone is what makes an
              inner scroll area feel broken. */}
          <div
            className={`mt-4 space-y-2 ${
              approvedShown.length > 6
                ? 'beacon-scroll max-h-[28rem] overflow-y-auto overscroll-contain rounded-xl pr-1'
                : ''
            }`}
          >
            {loading ? <BeaconSpinner inline label="Loading accounts" /> : approved.length === 0 ? (
              <p className="text-gray-400">No approved accounts to manage.</p>
            ) : approvedShown.length === 0 ? (
              <p className="text-gray-400">Nobody here matches “{findApproved.trim()}”.</p>
            ) : approvedShown.map((member) => (
              <div key={member.id} className="rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 self-start sm:self-center"
                    aria-label={`Select ${member.full_name || 'this account'}`}
                    checked={picked.includes(member.id)}
                    onChange={(event) => setPicked((prev) => (event.target.checked
                      ? [...prev, member.id]
                      : prev.filter((id) => id !== member.id)))}
                  />
                  <Avatar name={member.full_name || 'Member'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-semibold text-navy">{member.full_name || 'Member'}</p>
                      <NewBadge person={member} />
                    </div>
                    <p className="text-sm text-gray-500">{roleNoun(member.role)} · access approved</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      onClick={() => void disapprove(member)}
                      disabled={busy === member.id}
                    >
                      Disapprove
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setConfirmDelete(confirmDelete === member.id ? '' : member.id)}
                      disabled={busy === member.id}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {/* THE SECOND TAP, AND WHAT IT COSTS, IN THE SAME PLACE.
                    Saying "this cannot be undone" is not the same as saying
                    what goes: their messages, who they walked with, and their
                    way back in. The last line is the one a Director is
                    actually here for, so it is stated rather than implied. */}
                {confirmDelete === member.id && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
                    <p className="text-sm font-bold text-red-900">
                      Delete {member.full_name || 'this account'} permanently?
                    </p>
                    <p className="mt-1 text-sm text-red-800">
                      Their account, messages and pairings go, and cannot be brought back.
                      The record of who removed them is kept.
                    </p>
                    <p className="mt-1 text-sm text-red-800">
                      Their email address leaves the system, so you can invite them
                      again afterwards as a brand new member, in any role.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        className="bg-red-600 text-white hover:bg-red-700"
                        disabled={busy === member.id}
                        onClick={() => void deleteAccount(member)}
                      >
                        {busy === member.id ? 'Deleting…' : 'Yes, delete permanently'}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmDelete('')}>
                        Keep the account
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        )}

        {room === 'approvals' && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-navy">Awaiting approval</h2>
              <p className="text-sm text-gray-500">Invited people cannot enter their workspace until approved.</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">{pending.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? <BeaconSpinner inline label="Loading requests" /> : pending.length === 0 ? (
              <p className="text-gray-400">Nobody is waiting.</p>
            ) : pending.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center">
                <Avatar name={member.full_name || 'Member'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{member.full_name || 'Invited member'}</p>
                  <p className="text-sm text-gray-500">Invited as {roleNoun(member.role)}</p>
                </div>
                <Button onClick={() => void approve(member)} disabled={busy === member.id}>Approve</Button>
              </div>
            ))}
          </div>
        </Card>

        )}

        {room === 'pairings' && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Pair a Guide and Explorer</h2>
          <form onSubmit={pair} className="mt-4 grid gap-3 sm:grid-cols-2">
            <SelectPerson label="Guide" value={dmId} onChange={setDmId} people={guides} loading={loading} />
            <SelectPerson
              label="Explorer"
              value={dsId}
              onChange={setDsId}
              loading={loading}
              people={explorers.filter((explorer) => !pairings.some((p) => p.ds_id === explorer.id && p.status === 'active'))}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy === 'pair' || !dmId || !dsId}>Create pairing</Button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {pairings.filter((pairing) => pairing.status === 'active').map((pairing) => (
              <div key={pairing.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                {/* BOTH NAMES OPEN. The question a Director asks of this row
                    is whether the two belong together, and that cannot be
                    answered from two names and a stage. */}
                <button
                  type="button"
                  onClick={() => setOpenId(pairing.dm_id)}
                  className="font-semibold text-navy underline underline-offset-2"
                >
                  {pairing.dm_name}
                </button>
                <span className="text-gray-400">walking with</span>
                <button
                  type="button"
                  onClick={() => setOpenId(pairing.ds_id)}
                  className="font-semibold text-navy underline underline-offset-2"
                >
                  {pairing.ds_name}
                </button>
                <MinorBadge person={{ birthday: pairing.ds_birthday, guardian_consent_at: pairing.ds_guardian_consent_at }} />
                {/* WHEN THEY WERE CONNECTED. `created_at` has been on every one
                    of these rows since the table existed and was never drawn,
                    so the roster answered "who" and never "since when" -- and a
                    Director deciding whether a pairing is working needs the
                    second at least as much as the first. Three weeks and three
                    months are different questions about the same two names. */}
                <span className="text-xs text-gray-500">since {onDay(pairing.created_at)}</span>
                {/* THIS IS A STATUS, NOT A BUTTON, and it was read as one.
                    It shows where the Explorer is on the journey, and the
                    second stage is called "Connect" — so a grey pill reading
                    "Connect" sat immediately beside a large button reading
                    "Disconnect" and the pair looked like a choice. It was
                    reported as exactly that: "Connect should be bigger and
                    green".

                    Now it says what it is, and wears the stage's own colour
                    rather than the neutral grey every chip in the app shares. */}
                <span
                  className="ml-auto rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                  style={{
                    color: stageInfo(pairing.journey_stage).color,
                    backgroundColor: `${stageInfo(pairing.journey_stage).color}1A`,
                  }}
                >
                  Stage · {stageInfo(pairing.journey_stage).label}
                </span>
                {/* UNPAIR. A pairing could be made and never unmade, so a wrong
                    one could only be corrected in SQL. Archiving rather than
                    deleting keeps the conversation history intact -- the two
                    people simply stop being connected. */}
                <Button
                  variant="danger"
                  disabled={busy === `unpair-${pairing.id}`}
                  onClick={() => {
                    if (!confirm(
                      `Disconnect ${pairing.dm_name} from ${pairing.ds_name}? `
                      + 'Their conversation is kept, but they stop walking together.',
                    )) return;
                    void (async () => {
                      setBusy(`unpair-${pairing.id}`);
                      setError('');
                      try {
                        await live.endPairing(pairing.id);
                        setNotice(`${pairing.dm_name} and ${pairing.ds_name} are no longer paired.`);
                        await load();
                      } catch (cause) {
                        setError(errorText(cause));
                      } finally {
                        setBusy('');
                      }
                    })();
                  }}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>

          {/* -----------------------------------------------------------------
              THE PAIRINGS THAT HAVE ENDED
              -----------------------------------------------------------------
              WHAT A DIRECTOR COULD NOT SEE AT ALL. The list above filters to
              `status === 'active'`, so a pairing that ended simply stopped
              existing on this screen. Fifty-three of this church's pairings are
              archived and not one of them was visible to anybody -- which means
              a Director could not answer "has this Explorer had a Guide
              before?", or "how long did that last?", or "who was walking with
              them in August?".

              That is the question this whole change came from: "EDs and
              Directors should know when did the Guide and Explorer connected so
              we there would be a track record." A record that only holds the
              present is not a record.

              FOLDED SHUT, because the roster is about who is walking together
              now. It opens when somebody asks the question it answers -- the
              same shape as the appointments history.

              NEWEST FIRST, because the question is almost always about the most
              recent arrangement rather than the oldest. */}
          {(() => {
            const ended = pairings
              .filter((p) => p.status !== 'active')
              .sort((a, b) => (b.ended_at ?? b.created_at).localeCompare(a.ended_at ?? a.created_at));
            if (ended.length === 0) return null;
            return (
              <details className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
                <summary className="cursor-pointer text-sm font-bold text-navy">
                  {ended.length === 1
                    ? 'One pairing that has ended'
                    : `${ended.length} pairings that have ended`}
                </summary>
                <div className="mt-3 space-y-2">
                  {ended.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 border-t border-navy/5 pt-2 text-sm first:border-0 first:pt-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(p.dm_id)}
                        className="font-semibold text-navy underline underline-offset-2"
                      >
                        {p.dm_name}
                      </button>
                      <span className="text-gray-400">walked with</span>
                      <button
                        type="button"
                        onClick={() => setOpenId(p.ds_id)}
                        className="font-semibold text-navy underline underline-offset-2"
                      >
                        {p.ds_name}
                      </button>
                      {/* TWO DIFFERENT KINDS OF NULL, AND THE SCREEN SAYS WHICH.
                          A pairing archived before migration 20260913100000 has
                          an end date that was NEVER CAPTURED, and there is no
                          honest way to recover it -- `updated_at` moves on stage
                          changes, so reading it as an ending would put a
                          confident wrong day in front of a pastoral judgement.
                          Saying the date is not recorded is the truth, and it
                          stops being said for every pairing that ends from now
                          on. */}
                      <span className="ml-auto text-xs text-gray-500">
                        {onDay(p.created_at)}
                        {' \u2013 '}
                        {p.ended_at ? onDay(p.ended_at) : 'end date not recorded'}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            );
          })()}
        </Card>
        )}

        {/* The numbers first: a leader opens this to find out how the ministry
            is going, not to administer one more person. */}
        {room === 'church' && <LiveChurchOverview />}

        {/* The WALL, not the named requests. A Director is shown totals and
            never an identity; one who needs to know how a particular person is
            doing asks their Guide. prayer_wall() returns no identifier at all,
            so there is nothing to read even in the raw response.

            Worth stating because it was once reported as a bug — "the admin
            cannot see the prayer" — when it was the design working. */}
        {room === 'approvals' && <LiveRecommendationsForDirector />}
        {room === 'lessons' && <LiveStudies />}
        {room === 'church' && <LiveBoardReport churchName={church?.name} />}
      </div>
    </LiveAppShell>
  );
}

/**
 * Morning, afternoon or evening, by the reader's own clock.
 *
 * Local time deliberately: a Guide in Manila opening this at eight in the
 * evening should not be told good morning because a server in another
 * hemisphere thinks it is.
 */

function PeopleRoom({
  people,
  kind,
  pairings,
  onOpen,
}: {
  people: Profile[];
  kind: 'guides' | 'explorers' | 'directors';
  /** Open somebody's profile. The panel lives on the page, not in this list. */
  onOpen: (id: string) => void;
  pairings: live.PairingView[];
}) {
  const active = pairings.filter((p) => p.status === 'active');
  const loadOf = (guideId: string) => active.filter((p) => p.dm_id === guideId).length;
  const guideOf = (explorerId: string) =>
    active.find((p) => p.ds_id === explorerId)?.dm_name ?? null;

  const title = kind === 'guides' ? 'Guides' : kind === 'explorers' ? 'Explorers' : 'Directors';
  const empty =
    kind === 'guides' ? 'No Guides yet. Invite one from Approvals.'
      : kind === 'explorers' ? 'No Explorers yet. Invite one from Approvals.'
        : 'No other Directors in this church.';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-navy">{title}</h2>
        <span className="rounded-full bg-navy/10 px-3 py-1 text-sm font-bold text-navy">{people.length}</span>
      </div>

      {people.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {people.map((person) => {
            const load = kind === 'guides' ? loadOf(person.id) : 0;
            const walking = kind === 'explorers' ? guideOf(person.id) : null;
            return (
              <div key={person.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <Avatar name={person.full_name || 'Member'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpen(person.id)}
                      className="truncate font-semibold text-navy underline underline-offset-2"
                    >
                      {person.full_name}
                    </button>
                    {/* The Guides and Explorers rooms: a Director scanning a
                        roster needs to know who arrived this week. */}
                    <NewBadge person={person} />
                    <MinorBadge person={person} />
                  </div>
                  {kind === 'explorers' && (
                    // The one thing a Director looks for on this screen. An
                    // Explorer with no Guide has no app, so it is said plainly
                    // and coloured as something to fix rather than a blank.
                    walking
                      ? <p className="text-xs text-gray-500">walking with {walking}</p>
                      : <p className="text-xs font-semibold text-red-700">not yet paired</p>
                  )}
                  {kind === 'directors' && (
                    <p className="text-xs text-gray-500">Director</p>
                  )}
                </div>
                {kind === 'guides' && (
                  // Five is the cap, enforced in the database (migration 0030).
                  // Showing the load against it means a Director can see who
                  // has room without opening anything.
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      load >= 5 ? 'bg-red-100 text-red-800' : 'bg-white text-navy ring-1 ring-black/5'
                    }`}
                    title={load >= 5 ? 'At the cap of five' : `${5 - load} place${5 - load === 1 ? '' : 's'} free`}
                  >
                    {load}/5
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * A Guide's own numbers: how many Explorers, at which level, and how many have
 * been all the way through.
 *
 * GRADUATED IS THE POINT OF THE WHOLE DESIGN and no screen showed it. An
 * Explorer who reaches Commission has walked the journey and is now sent to
 * walk with somebody else, which is the only kind of growth this app believes
 * in. A Guide who cannot see that number cannot see whether any of it worked.
 *
 * "Still walking" is stated rather than left to be worked out. Five figures a
 * Director has to add up in their head is not a number they have.
 */
