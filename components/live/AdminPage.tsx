'use client';

import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { MinorBadge } from '@/components/MinorBadge';
import { copyText } from '@/lib/share';
import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollMotion } from '@/lib/motion';
import { useKeepUp, KEEP_UP_ROSTER } from '@/lib/live/keep-up';
import { roleNoun, stageInfo, APP_SHORT_NAME } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';

/** A short date for the pairing record; the year only when it is not this year. */
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
import { LiveHallOfJustice } from '@/components/LiveHallOfJustice';
import { LiveGuilds, LiveChurchPulse } from '@/components/LiveGuilds';
import { LiveSecurityAudit } from '@/components/LiveSecurityAudit';
import { LiveFeedbackInbox } from '@/components/LiveFeedbackInbox';
import { LiveLibraryRecord } from '@/components/LiveLibraryRecord';
import { LiveActivityAnalysis } from '@/components/LiveActivityAnalysis';
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
import { useFaces, faceOf } from '@/components/live/Face';

// The Director's and Executive Director's admin screen.

export function LiveAdminPage() {
  const { profile } = useLiveSession();
  const [members, setMembers] = useState<Profile[]>([]);
  // Faces for the approval lists, in one request.
  const faces = useFaces(members.map((m) => m.photo_path));
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
  // The pairing whose Guide is being changed, and the Guide chosen for it.
  const [changing, setChanging] = useState('');
  const [nextGuide, setNextGuide] = useState('');
  // Set when the invitation could not be emailed and must be passed on by hand.
  const [handLink, setHandLink] = useState<
    { to: string; url: string; why: string; wait?: number; pass?: string } | null
  >(null);
  // '' not tried, 'yes' copied, 'failed' (Safari refuses when unfocused; no
  // clipboard over plain http). The link is also in a selectable box.
  const [linkCopied, setLinkCopied] = useState<'' | 'yes' | 'failed'>('');

  const [findApproved, setFindApproved] = useState('');
  // Delete takes two taps in the row, not a confirm() dialog.
  const [confirmDelete, setConfirmDelete] = useState('');
  // Bulk selection as ids, so it survives re-sorting and filtering.
  const [picked, setPicked] = useState<string[]>([]);
  // '' none pending, or the bulk action waiting on its second press.
  const [bulkAsk, setBulkAsk] = useState<'' | 'disapprove' | 'delete'>('');
  // What happened to each person in the last batch.
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

  // The one profile open beside the list.
  const [openId, setOpenId] = useState('');
  // The panel is drawn above the tabs, and on a phone the row that opened it is
  // a long way below, so opening it scrolls it into view. Counted, so a second
  // tap on the same person scrolls back up to it too.
  const [opened, setOpened] = useState(0);
  const profilePanel = useRef<HTMLDivElement | null>(null);
  const openProfile = useCallback((id: string) => {
    setOpenId(id);
    setOpened((n) => n + 1);
  }, []);
  useEffect(() => {
    const panel = profilePanel.current;
    if (!opened || !panel) return;
    panel.scrollIntoView({ block: 'start', behavior: scrollMotion() });
    panel.focus({ preventScroll: true });
  }, [opened]);
  const [contact, setContact] = useState<Record<string, { email: string; joined_at: string }>>({});

  useEffect(() => {
    void load();
  }, [load]);
  useKeepUp(KEEP_UP_ROSTER, load);

  // The invited address and arrival date, from the same leadership-only function as the roster.
  useEffect(() => {
    live.memberContact().then(setContact).catch(() => setContact({}));
  }, []);

  /**
   * Show somebody's sign-in details again, to pass on by hand. Passwords are
   * never stored, so this issues a new one; the invite function refuses any
   * account that has finished signing up. Sends no email (`deliver: 'link'`).
   */
  const showSignIn = async (member: Profile) => {
    const email = contact[member.id]?.email;
    if (!email) {
      setError('That account has no address on file, so there is nothing to hand over.');
      return;
    }
    setBusy(member.id);
    setError('');
    setLinkCopied('');
    try {
      const result = await live.inviteMember({
        email,
        role: member.role,
        fullName: member.full_name || '',
        deliver: 'link',
      });
      setHandLink(result.link
        ? {
            to: email,
            url: result.link,
            // Not 'sent': nothing was sent.
            why: result.mailNote
              || 'Made for you to pass on. Nothing was e-mailed.',
            wait: result.waitSeconds,
            pass: result.tempPassword,
          }
        : null);
      if (!result.link) {
        setError(result.mailNote
          || 'No sign-in details could be made for that account. Somebody who has '
          + 'already chosen their own password keeps it, and it cannot be read here.');
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  const openPerson = members.find((m) => m.id === openId) ?? null;
  // The other half of their pairing, for the compatibility panel.
  const openPartner = (() => {
    if (!openPerson) return null;
    const pairing = pairings.find(
      (x) => x.status === 'active' && (x.dm_id === openPerson.id || x.ds_id === openPerson.id),
    );
    if (!pairing) return null;
    const otherId = pairing.dm_id === openPerson.id ? pairing.ds_id : pairing.dm_id;
    return members.find((m) => m.id === otherId) ?? null;
  })();

  // Only an Executive Director may invite an Executive Director.
  const roleOptions: Role[] = profile?.role === 'executive'
    ? ['executive', 'admin', 'dm', 'ds']
    : ['dm', 'ds'];
  const guides = members.filter((member) => member.role === 'dm' && member.is_approved);
  const explorers = members.filter((member) => member.role === 'ds' && member.is_approved);
  // Explorers with no Guide: the only ones who can be paired.
  const freeExplorers = explorers.filter(
    (explorer) => !pairings.some((p) => p.ds_id === explorer.id && p.status === 'active'),
  );
  // Either picker showing a search box; passed to both keeps them on one line.
  const pairPickersSearch = guides.length > 6 || freeExplorers.length > 6;
  const manageable = members.filter(
    (member) => member.id !== profile?.id && roleOptions.includes(member.role),
  );
  const pending = manageable.filter((member) => !member.is_approved);
  const approved = manageable.filter((member) => member.is_approved);

  // null: not asked yet. []: asked, and nobody is waiting.
  const [proposal, setProposal] = useState<live.SuggestedPairing[] | null>(null);
  const [pairResults, setPairResults] = useState<string[]>([]);

  /** The approver's first name, or '' when unknown (no auth user, or since deleted). */
  const approverName = (id: string | null | undefined): string => {
    if (!id) return '';
    const who = members.find((m) => m.id === id);
    return who?.full_name ? who.full_name.split(' ')[0] : '';
  };
  // Match the name, ignoring case and surrounding spaces.
  const approvedNeedle = findApproved.trim().toLowerCase();
  const approvedShown = approvedNeedle
    ? approved.filter((member) => (member.full_name || '').toLowerCase().includes(approvedNeedle))
    : approved;
  // Select-all applies to the rows on screen only.
  const pickedShown = approvedShown.filter((member) => picked.includes(member.id));
  // Only an Executive Director has a Directors room.
  const directors = members.filter((member) => member.role === 'admin' && member.is_approved);
  const isExec = profile?.role === 'executive';

  // Rooms in the order a Director uses them most (docs/DESIGN.md rule 1).
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
  // Remembered per role.
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

      // Not delivered by email: show the link to pass on by hand.
      if (result.delivery === 'link' && result.link) {
        setHandLink({
          to, url: result.link, why: result.mailNote ?? '',
          wait: result.waitSeconds, pass: result.tempPassword,
        });
        setNotice('');
      } else {
        // Show the link on success too: it is built from the church's own address,
        // unlike Supabase's email, which can point at a misconfigured Site URL.
        setHandLink(result.link
          ? { to, url: result.link, why: 'sent', pass: result.tempPassword }
          : null);
        // Say where it went and by which route.
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

  // Delete removes the account entirely, freeing the address; Disapprove only
  // switches it off. The database decides who may delete whom and logs it.
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

  // Bulk actions run the single-person call in a loop, so every rule and the log
  // still apply, and one refusal does not stop the rest. Each result is reported.
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
        <h1 className="text-2xl font-extrabold text-room sm:text-3xl">
          {church?.name || 'Church administration'}
        </h1>

        {/* Shown above the rooms only while a profile is open. */}
        {openPerson && (
          <div ref={profilePanel} tabIndex={-1} data-open-profile className="outline-none">
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
          </div>
        )}

        {/* The room tabs come first, always in the same place (docs/DESIGN.md rule 1). */}
        <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}

        {/* Pinned notices, below the tabs; shows nothing when there are none. */}
        <LiveAnnouncements hideWhenEmpty />

        {/* Open safeguarding reports, above the admin work; nothing when there are none. */}
        <LiveReportsForDirector
          onRemove={async (id, who) => {
            if (!confirm(
              `Remove ${who} from the church permanently? Their account, messages `
              + 'and pairings go. The record of this stays, and their email address '
              + 'is freed so they could be invited again.',
            )) return;
            try {
              // The database function, which removes the auth account too and returns a
              // sentence when it refuses.
              const verdict = await live.removeMemberByLeader(id);
              if (verdict !== 'ok') { setError(verdict); return; }
              setNotice(`${who} was removed from the church.`);
              await load();
            } catch (cause) {
              setError(humanError(cause, 'Could not remove them.'));
            }
          }}
        />

        {/* Guides, Explorers and (for Executives) Directors are separate rooms. */}
        {(room === 'guides' || room === 'explorers' || room === 'directors') && (
          <PeopleRoom
            people={room === 'guides' ? guides : room === 'explorers' ? explorers : directors}
            kind={room}
            pairings={pairings}
            cap={church?.guide_cap ?? 100}
            onOpen={openProfile}
          />
        )}

        {/* Safeguarding in order: reports, then cases, then the trial room. */}
        {/* The cases this Director is judging, beside the reports they come from. */}
        {room === 'safeguarding' && profile && <LiveHallOfJustice me={profile} />}
        {room === 'safeguarding' && profile && <LiveCourt me={profile} />}
        {room === 'safeguarding' && profile && (
          <LiveTrialRoom
            me={profile}
            onCaseOpened={() => {
              // Reload after a case, so the lists reflect any suspension.
              void load();
            }}
          />
        )}

        {/* Security: the account audit and the library record. Who appears in each is
           decided by the database; no record shows an address. */}
        {room === 'feedback' && <LiveFeedbackInbox />}

        {room === 'security' && (
          <>
            {/* The analysis first, then the feed. */}
            <LiveActivityAnalysis />
            <LiveSecurityAudit />
            <LiveLibraryRecord audience={profile?.role === 'executive' ? 'executive' : 'admin'} />
          </>
        )}

        {room === 'church' && profile && <LiveGuilds me={profile} />}
        {room === 'church' && <LiveChurchPulse />}

        {/* Directors can stock the library too; no pairings means no per-person sharing. */}
        {room === 'lessons' && <LiveLibraryForGuide pairings={[]} />}

        {room === 'approvals' && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Send an invitation e-mail</h2>
          <p className="mt-1 text-sm text-gray-500">The chosen role comes from the server-side invitation record.</p>
          {handLink && (
            // No mail provider yet is normal: the Director passes the details on by hand.
            <div className={`mt-4 rounded-2xl p-4 ring-1 ${
              handLink.wait
                ? 'bg-blue-50 ring-blue-300'
                : handLink.why === 'sent'
                  ? 'bg-green-50 ring-green-300'
                  : 'bg-amber-50 ring-amber-300'
            }`}>
              {/* A cooldown ("wait a moment") looks different from a fault ("change a setting"). */}
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
                The account is ready. The link can be used as often as they need; the
                password works for three days, or until they choose their own.
              </p>

              {/* The password, to read out if the email does not arrive. */}
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
                {/* For an Explorer, the invitation is the approval, so a Guide chosen here
                   pairs them as soon as they sign up. "Pair later" is a real choice. */}
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

        {/* Bulk invitations, under the single form. */}
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

          {/* Search appears above five rows. */}
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

          {/* Select all means all of what is on screen. */}
          {approvedShown.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-navy">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pickedShown.length === approvedShown.length && approvedShown.length > 0}
                  ref={(node) => {
                    // The checkbox's half-ticked state can only be set in code.
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

          {/* The second press names every person. */}
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

          {/* Results per person, so a refusal says who and why. */}
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

          {/* Its own scroll area, so the controls above stay on screen. max-h, not a fixed
             height; overscroll-contain keeps the page from scrolling on. */}
          <div
            className={`mt-4 space-y-2 ${
              approvedShown.length > 6
                ? 'beacon-scroll max-h-[28rem] overflow-y-auto overscroll-contain rounded-xl pr-1'
                : ''
            }`}
          >
            {loading ? <BeaconSpinner inline label="Loading accounts" /> : approved.length === 0 ? (
              <p className="text-gray-500">No approved accounts to manage.</p>
            ) : approvedShown.length === 0 ? (
              <p className="text-gray-500">Nobody here matches “{findApproved.trim()}”.</p>
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
                  <Avatar name={member.full_name || 'Member'} photo={faceOf(faces, member.photo_path)} avatar={member.avatar ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-semibold text-navy">{member.full_name || 'Member'}</p>
                      <NewBadge person={member} />
                    </div>
                    {/* When and by whom access was approved. A missing date means approved before
                       dates were recorded, and the line says so. */}
                    <p className="text-sm text-gray-500">
                      {roleNoun(member.role)}
                      {member.approved_at
                        ? ` · approved ${onDay(member.approved_at)}${
                            approverName(member.approved_by) ? ` by ${approverName(member.approved_by)}` : ''}`
                        : ' · access approved · date not recorded'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Not destructive, so not red, and before the two that are. */}
                    <Button
                      variant="ghost"
                      onClick={() => void showSignIn(member)}
                      disabled={busy === member.id}
                    >
                      {busy === member.id ? 'Working…' : 'Sign-in details'}
                    </Button>
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

                {/* The second tap says what is lost: messages, pairings, and their way back in. */}
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
              <p className="text-gray-500">Nobody is waiting.</p>
            ) : pending.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center">
                <Avatar name={member.full_name || 'Member'} photo={faceOf(faces, member.photo_path)} avatar={member.avatar ?? undefined} />
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
            {/* Both pickers reserve the search row together, so they stay on one line. */}
            <SelectPerson
              label="Guide"
              value={dmId}
              onChange={setDmId}
              people={guides}
              loading={loading}
              reserveSearchRow={pairPickersSearch}
              emptyNote={guides.length === 0
                ? 'Nobody in this church has the Guide role yet. Invite one, or change somebody\u2019s role from their profile.'
                : undefined}
            />
            {/* Only unpaired Explorers are offered, so an empty list usually means everyone
               has a Guide; it says so. */}
            <SelectPerson
              label="Explorer"
              value={dsId}
              onChange={setDsId}
              loading={loading}
              people={freeExplorers}
              reserveSearchRow={pairPickersSearch}
              emptyLabel={explorers.length === 0
                ? undefined
                : 'Everybody already has a Guide'}
              emptyNote={explorers.length === 0
                ? 'No Explorers have been approved into this church yet.'
                : `All ${explorers.length} Explorers in this church are already `
                  + 'walking with a Guide. To move somebody to a different Guide, '
                  + 'end their pairing below first: an Explorer has one Guide at a time.'}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy === 'pair' || !dmId || !dsId}>Create pairing</Button>
            </div>
          </form>

          {/* Pair everybody who is waiting. It proposes; the Director reads the list and
             confirms, and each pairing is then made through createPairing, one at a
             time, so every rule applies and a refusal names who and why. */}
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-navy/5 sm:p-4">
            {proposal === null ? (
              <>
                <p className="text-sm font-bold text-navy">Everybody who is waiting</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  Suggests a Guide for each Explorer who has none, giving each Guide the
                  fewest people first. You see the list before anything happens.
                </p>
                <div className="mt-3">
                  <Button
                    disabled={busy === 'suggest'}
                    onClick={() => void (async () => {
                      setBusy('suggest'); setError(''); setPairResults([]);
                      try { setProposal(await live.suggestPairings()); }
                      catch (cause) { setError(errorText(cause)); }
                      finally { setBusy(''); }
                    })()}
                  >
                    {busy === 'suggest' ? 'Working…' : 'Suggest pairings'}
                  </Button>
                </div>
              </>
            ) : proposal.length === 0 ? (
              <>
                <p className="text-sm font-bold text-navy">Nobody is waiting</p>
                {/* The two reasons a proposal can be empty, said apart. */}
                <p className="mt-0.5 text-sm text-gray-600">
                  Every Explorer already has a Guide, or every Guide is at the limit for
                  this church, in which case the people still waiting need another Guide
                  rather than another pairing. Anyone under eighteen is left out on
                  purpose and is paired by hand.
                </p>
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="mt-2 text-sm font-semibold text-navy underline underline-offset-2"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-navy">
                  {proposal.length === 1
                    ? 'One pairing to make'
                    : `${proposal.length} pairings to make`}
                </p>
                <p className="mt-0.5 text-sm text-gray-600">
                  Nothing has happened yet. Read the list, then confirm.
                </p>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {proposal.map((row) => (
                    <div key={row.ds_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-navy/5">
                      <span className="font-semibold text-navy">{row.dm_name}</span>
                      <span className="text-gray-500">with</span>
                      <span className="font-semibold text-navy">{row.ds_name}</span>
                      <span className="ml-auto text-xs text-gray-500">
                        {row.dm_load_now === 0
                          ? 'their first'
                          : `already has ${row.dm_load_now}`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    disabled={busy === 'autopair'}
                    onClick={() => void (async () => {
                      setBusy('autopair'); setError('');
                      const failed: string[] = [];
                      let made = 0;
                      for (const row of proposal) {
                        try {
                          // One at a time. 'traditional' is the default track; it can be changed after.
                          await live.createPairing(row.dm_id, row.ds_id, 'traditional');
                          made += 1;
                        } catch (cause) {
                          failed.push(`${row.dm_name} with ${row.ds_name}: ${errorText(cause)}`);
                        }
                      }
                      setPairResults(failed);
                      setNotice(made === 1
                        ? 'One pairing made.'
                        : `${made} pairings made.`);
                      setProposal(null);
                      await load();
                      setBusy('');
                    })()}
                  >
                    {busy === 'autopair' ? 'Pairing…' : `Yes, make these ${proposal.length}`}
                  </Button>
                  <Button variant="ghost" onClick={() => setProposal(null)}>Cancel</Button>
                </div>
              </>
            )}

            {/* Results per pairing. */}
            {pairResults.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="font-bold">Not every pairing could be made:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {pairResults.map((line) => <li key={line}>{line}</li>)}
                </ul>
                <button
                  type="button"
                  onClick={() => setPairResults([])}
                  className="mt-2 text-xs font-semibold underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-2">
            {pairings.filter((pairing) => pairing.status === 'active').map((pairing) => (
              <div key={pairing.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                {/* Both names open their profiles. */}
                <button
                  type="button"
                  onClick={() => openProfile(pairing.dm_id)}
                  className="font-semibold text-navy underline underline-offset-2"
                >
                  {pairing.dm_name}
                </button>
                <span className="text-gray-500">walking with</span>
                <button
                  type="button"
                  onClick={() => openProfile(pairing.ds_id)}
                  className="font-semibold text-navy underline underline-offset-2"
                >
                  {pairing.ds_name}
                </button>
                <MinorBadge person={{ birthday: pairing.ds_birthday, guardian_consent_at: pairing.ds_guardian_consent_at }} />
                {/* When they were connected. */}
                <span className="text-xs text-gray-500">since {onDay(pairing.created_at)}</span>
                {/* A status, not a button, in the stage's own colour. */}
                <span
                  className="ml-auto rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                  style={{
                    color: stageInfo(pairing.journey_stage).color,
                    backgroundColor: `${stageInfo(pairing.journey_stage).color}1A`,
                  }}
                >
                  Stage · {stageInfo(pairing.journey_stage).label}
                </span>
                {/* Unpair archives the pairing; the conversation history stays. */}
                {/* Change Guide: the first pairing ends and a new one starts; the conversation
                   stays with the first two. */}
                <Button
                  variant="ghost"
                  onClick={() => { setChanging(changing === pairing.id ? '' : pairing.id); setNextGuide(''); }}
                >
                  {changing === pairing.id ? 'Keep this Guide' : 'Change Guide'}
                </Button>
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
                {changing === pairing.id && (
                  <div className="mt-2 w-full space-y-2 rounded-xl bg-white p-3 ring-1 ring-navy/10" data-change-guide>
                    <SelectPerson
                      label={`New Guide for ${pairing.ds_name}`}
                      value={nextGuide}
                      onChange={setNextGuide}
                      people={guides.filter((guide) => guide.id !== pairing.dm_id)}
                      emptyLabel="No other approved Guide in this church yet."
                    />
                    <p className="text-xs text-gray-600">
                      {pairing.ds_name} keeps their place on the journey. Their conversation
                      with {pairing.dm_name} stays between the two of them; the new Guide
                      starts a new one.
                    </p>
                    <Button
                      variant="gold"
                      disabled={!nextGuide || busy === `change-${pairing.id}`}
                      onClick={() => {
                        void (async () => {
                          setBusy(`change-${pairing.id}`);
                          setError('');
                          try {
                            await live.changeGuide(pairing.id, nextGuide);
                            const who = guides.find((guide) => guide.id === nextGuide)?.full_name || 'The new Guide';
                            setNotice(`${who} is now walking with ${pairing.ds_name}.`);
                            setChanging('');
                            setNextGuide('');
                            await load();
                          } catch (cause) {
                            setError(errorText(cause));
                          } finally {
                            setBusy('');
                          }
                        })();
                      }}
                    >
                      {busy === `change-${pairing.id}` ? 'Changing…' : 'Change Guide'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pairings that have ended, newest first, folded shut. */}
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
                        onClick={() => openProfile(p.dm_id)}
                        className="font-semibold text-navy underline underline-offset-2"
                      >
                        {p.dm_name}
                      </button>
                      <span className="text-gray-500">walked with</span>
                      <button
                        type="button"
                        onClick={() => openProfile(p.ds_id)}
                        className="font-semibold text-navy underline underline-offset-2"
                      >
                        {p.ds_name}
                      </button>
                      {/* A pairing archived before end dates were recorded says so rather than guessing. */}
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

        {/* The numbers first. */}
        {room === 'church' && <LiveChurchOverview />}

        {/* Directors see the anonymous prayer wall, never named requests. */}
        {room === 'approvals' && <LiveRecommendationsForDirector />}
        {room === 'lessons' && <LiveStudies />}
        {room === 'church' && <LiveBoardReport churchName={church?.name} />}
      </div>
    </LiveAppShell>
  );
}

function PeopleRoom({
  people,
  kind,
  pairings,
  cap,
  onOpen,
}: {
  people: Profile[];
  kind: 'guides' | 'explorers' | 'directors';
  /** Open somebody's profile. The panel lives on the page, not in this list. */
  onOpen: (id: string) => void;
  pairings: live.PairingView[];
  /** This church's own limit, read from the church rather than assumed. */
  cap: number;
}) {
  const active = pairings.filter((p) => p.status === 'active');
  const loadOf = (guideId: string) => active.filter((p) => p.dm_id === guideId).length;
  const guideOf = (explorerId: string) =>
    active.find((p) => p.ds_id === explorerId)?.dm_name ?? null;

  // Everybody's face in this room, in one request.
  const faces = useFaces(people.map((p) => p.photo_path));
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
                {/* The face opens the profile too. */}
                <button type="button" onClick={() => onOpen(person.id)} className="shrink-0 rounded-full" aria-label={`Open ${person.full_name || 'this person'}'s profile`}>
                  <Avatar name={person.full_name || 'Member'} photo={faceOf(faces, person.photo_path)} avatar={person.avatar ?? undefined} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpen(person.id)}
                      className="truncate font-semibold text-navy underline underline-offset-2"
                    >
                      {person.full_name}
                    </button>
                    {/* Who arrived this week. */}
                    <NewBadge person={person} />
                    <MinorBadge person={person} />
                  </div>
                  {kind === 'explorers' && (
                    // An Explorer without a Guide is flagged as something to fix.
                    walking
                      ? <p className="text-xs text-gray-500">walking with {walking}</p>
                      : <p className="text-xs font-semibold text-red-700">not yet paired</p>
                  )}
                  {kind === 'directors' && (
                    <p className="text-xs text-gray-500">Director</p>
                  )}
                </div>
                {kind === 'guides' && (
                  // The cap is the church's own figure.
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      load >= cap ? 'bg-red-100 text-red-800' : 'bg-white text-navy ring-1 ring-black/5'
                    }`}
                    title={load >= cap
                      ? `At this church's cap of ${cap}`
                      : `${cap - load} place${cap - load === 1 ? '' : 's'} free`}
                  >
                    {load}/{cap}
                  </span>
                )}
                {/* Say that the row opens the profile. */}
                <button
                  type="button"
                  onClick={() => onOpen(person.id)}
                  data-profile-button
                  className="tap-sm shrink-0 rounded-full bg-white px-3 text-xs font-bold text-navy ring-1 ring-navy/15 hover:bg-gray-100"
                >
                  Profile
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
