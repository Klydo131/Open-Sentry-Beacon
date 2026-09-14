'use client';

// The last two screens that still fell through to the placeholder.
//
// /church and /mail were written against the in-browser store, so on a live
// deployment both showed AppShell's grey "This live screen is being connected"
// card. That card was the single most-reported thing in this app, and every
// report was the same underlying fault: a page with no live version.
//
// /mail needed more than a port. In the tutorial it is a SIMULATED mailbox —
// "what Beacon would send you" — which is a teaching device and means nothing
// on a real deployment, where mail goes to real inboxes. Its honest live
// counterpart is the outbox: who has been invited, who has not arrived, and the
// link to hand over when the email did not make it.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_ROSTER } from '@/lib/live/keep-up';
import { useRouter } from 'next/navigation';
import { copyText } from '@/lib/share';
import { Button, Card } from '@/components/ui';
import { roleNoun } from '@/lib/brand';
import * as live from '@/lib/live/data';
import { LiveBlogFeed } from '@/components/LiveBlog';
import { useLiveSession } from '@/lib/live/session';
import { LiveChurchOverview, LiveBoardReport } from '@/components/LiveExecutive';
import { LiveBillboard } from '@/components/LiveBillboard';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { humanError } from '@/lib/live/errors';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong. Please try again.');

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
};

export function LiveChurchPage() {
  const { profile } = useLiveSession();
  const [churchName, setChurchName] = useState<string>();

  useEffect(() => {
    live.myChurch().then((c) => setChurchName(c?.name ?? undefined)).catch(() => {});
  }, []);


  if (!profile) return <BeaconSpinner inline label="Loading" />;
  const leads = profile.role === 'admin' || profile.role === 'executive';
  const explorer = profile.role === 'ds';

  return <ChurchRooms profile={profile} churchName={churchName} leads={leads} explorer={explorer} />;
}

/**
 * The church, in three folders instead of one long page.
 *
 * It ran to nearly five screens on a phone: the masthead, everything the
 * congregation has written, every notice pinned to the board, the counts and
 * the board report, one after another. Somebody coming to read a notice
 * scrolled past twenty blog posts to reach it.
 *
 * THE ORDER INSIDE EACH FOLDER IS UNCHANGED, and that matters more than it
 * looks: the masthead comes first because the church's name is the first
 * thing, and the counts are still absent for an Explorer, because a tally of
 * how many people like them there are is the church looking at itself.
 */
function ChurchRooms({ profile, churchName, leads, explorer }: {
  profile: { id: string; role: string };
  churchName?: string;
  leads: boolean;
  explorer: boolean;
}) {
  const rooms: Room[] = [
    { id: 'notices', label: '📌 Notices' },
    { id: 'blogs', label: '✍️ Community Blogs' },
    // An Explorer has no numbers folder at all rather than an empty one. A room
    // that would be empty for somebody tells them they are missing something.
    ...(explorer ? [] : [{ id: 'numbers', label: '📊 The numbers' }]),
  ];
  const [room, chooseRoom] = useRoom(rooms, `beacon:church-room:${profile.role}`);

  return (
    <div className="space-y-6">
      <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

      {/* THE BOARD. Masthead and the church's own notices. The blogs used to be
          woven between the two by the `between` prop, which was the right call
          when this was one page and is the wrong one now: they are their own
          folder, and a folder that also appears inside another folder is a
          thing nobody can find twice. */}
      {room === 'notices' && <LiveBillboard churchName={churchName} />}

      {/* WHAT PEOPLE WROTE, which is the reason to come back. */}
      {room === 'blogs' && <LiveBlogFeed selfId={profile.id} />}

      {/* NOT FOR EXPLORERS. Counts of Guides, Explorers, approvals and prayer
          requests are the church looking at itself, a management view. An
          Explorer opening this screen wants their church, not a tally of how
          many people like them there are and how many have "graduated". It
          reads as being counted, and it was once the first thing on the page.

          It is safe in the sense that matters, with no names, no conversations
          and never who wrote a prayer request, which is why it was shown to
          everybody in the first place. Safe is not the same as theirs.

          The board report is numbers only and names nobody, so a Guide sees it
          too. A Guide who can see what their church reports upward is a Guide
          who trusts the reporting. */}
      {room === 'numbers' && (
        <>
          <LiveChurchOverview />
          {leads && <LiveBoardReport churchName={churchName} />}
        </>
      )}
    </div>
  );
}

export function LiveMailPage() {
  const { profile } = useLiveSession();
  const [invites, setInvites] = useState<live.OpenInvite[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  // Copying can genuinely fail: Safari rejects when the document is not
  // focused, and navigator.clipboard is undefined over plain http. Silence
  // reads as a broken button, so say so and point at the box they can select.
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState('');
  // Set when a resend could not be emailed and must be passed on by hand.
  const [handLink, setHandLink] = useState<
    { to: string; url: string; why: string; wait?: number; pass?: string } | null
  >(null);
  const [sentTo, setSentTo] = useState('');
  const [confirmCancel, setConfirmCancel] = useState('');
  const [cancelled, setCancelled] = useState('');

  const load = useCallback(async () => {
    try { setInvites(await live.listInvites()); setError(''); }
    catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_ROSTER, load);

  // RESEND, WITHOUT RETYPING ANYTHING.
  //
  // The function has handled a repeat invitation since v6 — pressing Invite
  // again on somebody who has not joined refreshes their link and sends it. But
  // the only way to reach that was to type the person's name, address and role
  // into the Director's form a second time, from memory, exactly right. The
  // capability existed and the button did not, which from the outside is
  // indistinguishable from the capability not existing.
  //
  // Everything it needs is already on the row, so nothing is retyped.
  const resend = async (invite: live.OpenInvite, deliver?: 'link') => {
    setBusy(invite.id);
    setError('');
    setSentTo('');
    setHandLink(null);
    try {
      const result = await live.inviteMember({
        email: invite.email,
        role: invite.role,
        fullName: invite.full_name ?? '',
        deliver,
      });
      if (result.delivery === 'link' && result.link) {
        setHandLink({
          to: invite.email, url: result.link, why: result.mailNote ?? '',
          wait: result.waitSeconds, pass: result.tempPassword,
        });
      } else {
        setSentTo(invite.email);
      }
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  // RE-SEND TO EVERYONE WHO HAS NOT FINISHED.
  //
  // WHY THIS IS NEEDED AND WHAT IT FIXES. An invitation creates the account the
  // moment it is sent, so the row shows "has an account" for somebody who has
  // never chosen a password and cannot sign in. Twenty-three people were in
  // exactly that state at once — most of them because the one-time link had
  // been spent: they followed the install steps first, the installed app opened
  // as a fresh session with no invitation in it, and the link was gone by the
  // time they came back. That is the bug the email reorder fixed going forward;
  // it does nothing for the people already stranded.
  //
  // The per-row Re-send has always been able to rescue one of them. Twenty-three
  // of them is twenty-three taps, from a screen that does not say which rows
  // need it, which is how somebody gets missed.
  //
  // ONE AT A TIME AND PACED, NOT ALL AT ONCE. The mailer allows one message per
  // ADDRESS per minute and has an hourly ceiling for the whole project, so a
  // burst of twenty-three parallel sends would have the first few succeed and
  // the rest refused — and the refusals look identical to a broken button. They
  // go in sequence with a breath between them, the count is shown as it climbs,
  // and anything refused is named at the end rather than swallowed.
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkFailed, setBulkFailed] = useState<string[]>([]);

  // Somebody who has an account but never finished. `joined_at` is
  // signup_completed_at, which is stamped once, after a password is chosen.

  // AN INVITATION WHOSE ACCOUNT WAS REMOVED IS NOT A PENDING INVITATION.
  //
  // Sending one creates the account (supabase/functions/invite: "the account is
  // created here, with a password already on it"). So Re-send on a row whose
  // person has been removed does not resend anything -- it REBUILDS the account
  // of somebody a leader deleted, from a row that said "never sent", as though
  // nothing had ever happened. On the reported screen 78 of 81 rows were this,
  // and none of them was genuinely unsent.
  //
  // redeemed_at alone must never be read as "they joined" -- see OpenInvite,
  // where doing so was wrong twice. Paired with the absence of an account it is
  // exact: the invitation was spent, so an account existed, and it is gone now.
  const isRemoved = (i: live.OpenInvite) =>
    !i.joined_at && i.redeemed_at !== null && !i.has_account;
  const removed = (invites ?? []).filter(isRemoved);
  // Everything that sends -- the row buttons and the bulk send alike -- works
  // from this list, so neither can reach a removed person.
  const unfinished = (invites ?? []).filter((i) => !i.joined_at && !isRemoved(i));

  const resendAllUnfinished = async () => {
    const queue = unfinished;
    if (queue.length === 0) return;
    setError('');
    setSentTo('');
    setHandLink(null);
    setBulkFailed([]);
    setBulk({ done: 0, total: queue.length });
    const failed: string[] = [];
    for (let at = 0; at < queue.length; at += 1) {
      const invite = queue[at];
      try {
        const result = await live.inviteMember({
          email: invite.email,
          role: invite.role,
          fullName: invite.full_name ?? '',
        });
        // A link handed back instead of sent is a refusal wearing a success:
        // the account is fine and the MESSAGE did not go, so it counts as one
        // to chase rather than one that is done.
        if (result.delivery === 'link') failed.push(invite.email);
      } catch {
        failed.push(invite.email);
      }
      setBulk({ done: at + 1, total: queue.length });
      // A breath between sends. Not a fix for the hourly ceiling — nothing here
      // can be — but it keeps a burst from being refused purely for its shape.
      if (at < queue.length - 1) await new Promise((go) => setTimeout(go, 1200));
    }
    setBulkFailed(failed);
    setBulk(null);
    await load();
  };

  const cancel = async (invite: live.OpenInvite) => {
    setBusy(invite.id);
    setError('');
    setSentTo('');
    setHandLink(null);
    try {
      await live.cancelInvite(invite.id);
      setCancelled(invite.email);
      setConfirmCancel('');
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  if (!profile) return <BeaconSpinner inline label="Loading" />;

  const leads = profile.role === 'admin' || profile.role === 'executive';
  if (!leads) {
    // NOT AN EMPTY CARD. This screen is the Invitations list, which a Guide or
    // an Explorer has no part in, and what stood here was a card whose entire
    // content explained why it was empty. The navigation no longer offers it
    // to them; anybody who arrives by an old link or a bookmark goes home
    // rather than reading an apology.
    return (
      <Card className="p-6 text-center">
        <p className="text-gray-600">Taking you back to your church.</p>
        <RedirectHome />
      </Card>
    );
  }

  // Split on whether they FINISHED SIGNING UP — chose a password of their own.
  //
  // Two earlier answers were wrong here, in the same direction. redeemed_at is
  // stamped when the account row is created, which is the moment Send is
  // pressed. last_sign_in_at is stamped when the link is opened, which the
  // Director does on their own device to check it works. Both filed people
  // under Accepted who had never touched anything — and left them with no
  // Re-send button, because the screen believed there was nothing left to do.
  const waiting = (invites ?? []).filter((i) => !i.joined_at && !isRemoved(i));
  const joined = (invites ?? []).filter((i) => i.joined_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-room">Invitations</h1>
        <p className="text-room-soft">
          Everyone this church has invited, and who is still on the doorstep.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {cancelled && (
        <p className="rounded-xl bg-gray-100 px-4 py-3 text-gray-700 ring-1 ring-gray-300">
          Invitation to {cancelled} withdrawn. That address can be invited again.
        </p>
      )}

      {sentTo && (
        <p className="rounded-xl bg-green-50 px-4 py-3 font-semibold text-green-800 ring-1 ring-green-300">
          ✓ Invitation link re-sent to {sentTo}.
        </p>
      )}

      {handLink && (
        // A church with no working mail provider is a normal state and must not
        // be a dead end: the account and the link are real, only the postman is
        // missing, so the Director becomes the postman.
        <div className={`rounded-2xl p-4 ring-1 ${
          handLink.wait ? 'bg-blue-50 ring-blue-300' : 'bg-amber-50 ring-amber-300'
        }`}>
          {/* A cooldown is not a fault. See LiveCorePages for the reasoning. */}
          <p className={`font-bold ${handLink.wait ? 'text-blue-900' : 'text-amber-900'}`}>
            {handLink.wait
              ? `Nearly there. Wait ${handLink.wait} seconds, then press Re-send once`
              : `Send this link to ${handLink.to} yourself`}
          </p>
          <p className={`mt-1 text-sm ${handLink.wait ? 'text-blue-800' : 'text-amber-800'}`}>
            {handLink.why || 'No email service is set up on this project yet.'}
          </p>
          {/* THIS PANEL USED TO CARRY TWO WARNINGS THAT ARE NOW FALSE, and a
              false warning is worse than none: it teaches a Director to be
              careful about the wrong thing and to distrust the screen when the
              caution turns out not to apply.

              It said the link works ONCE and that opening it would sign the
              Director out and start somebody else's sign-up on their device.
              Both were true of a one-time token. The invitation carries a
              password now and this address is the ordinary sign-in page, so it
              can be opened, forwarded and used as often as anybody likes, and
              opening it does nothing at all to the Director's own session. */}
          <p className={`mt-1 text-sm ${handLink.wait ? 'text-blue-800' : 'text-amber-800'}`}>
            Nothing here expires. They can use it as often as they need, on any
            device, and opening it yourself is harmless.
          </p>
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
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={handLink.url}
              onFocus={(e) => e.currentTarget.select()}
              className={`tap min-w-0 flex-1 rounded-xl bg-white px-3 text-sm ring-1 ${
                handLink.wait ? 'ring-blue-300' : 'ring-amber-300'
              }`}
            />
            {/* Only says Copied when it copied. The old version discarded the
                promise, so a Safari rejection was an unhandled rejection nobody
                saw and the person got no clipboard and no message. */}
            <Button
              variant="ghost"
              onClick={async () => {
                const done = await copyText(handLink.url);
                setCopied(done ? 'hand' : '');
                if (!done) setCopyFailed(true);
              }}
            >
              {copied === 'hand' ? '✓ Copied' : 'Copy link'}
            </Button>
            <Button variant="ghost" onClick={() => setHandLink(null)}>Done</Button>
          </div>
          {copyFailed && (
            // A dead-end message would be worse than the silence it replaces,
            // so it names the way out: the link is already in a box that
            // selects itself when tapped.
            <p className="mt-2 text-sm text-amber-800">
              This browser would not let the app copy for you. Tap the box above
              to select the link, then copy it yourself.
            </p>
          )}
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Waiting to accept {invites && <span className="text-gray-400">· {waiting.length}</span>}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Everybody here still needs to set a password of their own. An
          invitation that failed to send looks exactly like one somebody has not
          got round to, so if a person says they never got theirs, press
          <strong> Re-send</strong>. It mints a fresh link and posts it again,
          with nothing to retype.
        </p>
        {/* SAY THE COST OF THE BUTTON NEXT TO THE BUTTON.
            A person may hold only one live invitation, so re-sending switches
            off the link already in their inbox. That is correct -- an old link
            outliving its replacement would be a way in nobody could revoke --
            but every invitation email looks identical, so somebody pressed
            three times, sent the recipient to the oldest of the three, and
            watched it fail as "expired". Nothing here said that would happen. */}
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Press it once.</strong> Each re-send switches off the link
          already in that person&rsquo;s inbox, so only the newest email will
          work. If they are unsure which to open, tell them to use the most
          recent one.
        </p>

        {/* THE ONE BUTTON FOR THE WHOLE BACKLOG. It names the number, because a
            Director needs to know whether this is three people or twenty-three
            before they press something that sends that many emails. */}
        {unfinished.length > 1 && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-navy/5">
            <p className="text-sm text-gray-700">
              <strong className="text-navy">{unfinished.length} people</strong> have an
              account but have never set a password, so they cannot sign in yet.
              Sending everybody a fresh link is usually all it takes.
            </p>
            <Button
              variant="gold"
              className="mt-2"
              disabled={!!bulk || !!busy}
              onClick={() => void resendAllUnfinished()}
            >
              {bulk
                ? `Sending ${bulk.done} of ${bulk.total}…`
                : `Send all ${unfinished.length} a fresh link`}
            </Button>
            {bulk && (
              <p className="mt-2 text-sm text-gray-500">
                One at a time, with a pause between each. Leave this screen open.
              </p>
            )}
            {bulkFailed.length > 0 && (
              // Named, not counted. "Three failed" leaves a Director with no
              // idea which three, and they are the only ones who can chase.
              <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">
                  These {bulkFailed.length} did not go, and need chasing by hand:
                </p>
                <p className="mt-1 break-words">{bulkFailed.join(', ')}</p>
                <p className="mt-1">
                  Usually the hourly email allowance. Wait an hour and press it
                  again, or use Re-send on those rows to get a link you can pass
                  on yourself.
                </p>
              </div>
            )}
          </div>
        )}

        {!invites ? (
          <BeaconSpinner inline label="Loading" className="mt-4" />
        ) : waiting.length === 0 ? (
          <p className="mt-4 text-gray-500">Nobody is waiting. Everyone invited has joined.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {waiting.map((i) => {
              const expired = new Date(i.expires_at).getTime() < Date.now();
              return (
                <li key={i.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{i.full_name || i.email}</p>
                      <p className="truncate text-sm text-gray-600">{i.email}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {roleNoun(i.role)} · invited {ago(i.created_at)}
                        {expired && <span className="ml-1 font-semibold text-red-600">· link expired</span>}
                        {/* Sending an invitation creates the person's account
                            before the message goes, so ALMOST every row here
                            has one — which is why "has an account" is not shown
                            as a badge. Its absence is the useful half: no
                            account means the send never got that far, so no
                            message can have arrived, however it looked. */}
                        {!i.has_account && (
                          <span className="ml-1 font-semibold text-amber-700">· never sent</span>
                        )}
                        {/* THE BADGE THAT USED TO SIT HERE SAID THE OPPOSITE OF
                            THE TRUTH, and it is gone rather than reworded.
                            It read "link opened, no password set yet" and was
                            drawn from `opened_at`, which church_invitations
                            fills from auth.users.last_sign_in_at. So it appeared
                            for people who had SIGNED IN -- it announced that
                            somebody using the app had no password, beside a
                            Re-send button that would then replace the password
                            they were using.
                            Now that signing in counts as joining, those rows
                            are in Accepted below and this list cannot contain
                            one, so there is nothing left for it to label. */}
                      </p>
                    </div>
{/* NOT `shrink-0`. It was, and `shrink-0` with `flex-wrap` are a
                        contradiction: shrink-0 pins the row at the width of all
                        its buttons in a line, so it can never wrap, and it runs
                        off the side of a phone instead. The reported screen had
                        Re-send, Cancel and half of "Copy address", with the rest
                        past the edge of the glass.

                        Full width below `sm`, so the buttons wrap under the
                        address rather than fighting it for the same line. */}
                    <span className="flex w-full flex-wrap gap-2 sm:w-auto">
                      <Button variant="gold" disabled={busy === i.id} onClick={() => resend(i)}>
                        {busy === i.id ? 'Sending…' : 'Re-send'}
                      </Button>
                      {/* THE ROUTE THAT DOES NOT GO THROUGH ANYBODY'S INBOX.
                          An emailed link can be opened by a mail scanner before
                          the person it was sent to touches it, and then it is
                          spent -- which is what "it expired the first time I
                          opened it" has always been. Nothing is emailed here,
                          so there is nothing for a scanner to find, and most of
                          this congregation is easier to reach on Messenger than
                          by email anyway.

                          It mints a link like every other send, so it switches
                          off whatever was in their inbox. The panel that opens
                          says so before they send it on. */}
                      <Button
                        variant="ghost"
                        disabled={busy === i.id}
                        onClick={() => resend(i, 'link')}
                      >
                        Get a link to send myself
                      </Button>
                      {/* An invitation sent to the wrong address, or with the
                          wrong role, used to be permanent — and because one
                          open invitation per address is enforced, that slip
                          also blocked the corrected one. Two taps, because
                          deleting the wrong row loses a real invitation. */}
                      <Button
                        variant="ghost"
                        disabled={busy === i.id}
                        onClick={() => setConfirmCancel(confirmCancel === i.id ? '' : i.id)}
                      >
                        {confirmCancel === i.id ? 'Keep it' : 'Cancel'}
                      </Button>
                      {confirmCancel === i.id && (
                        <Button variant="ghost" disabled={busy === i.id} onClick={() => cancel(i)}>
                          Really cancel
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          // Was setCopied() unconditionally, so it said Copied
                          // even when the write had failed.
                          const done = await copyText(i.email);
                          if (done) setCopied(i.id);
                          else setCopyFailed(true);
                        }}
                      >
                        {copied === i.id ? 'Copied' : 'Copy address'}
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {removed.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">
            Account since removed <span className="text-gray-400">· {removed.length}</span>
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            These invitations were used and the account was later deleted. They are
            kept as a record. There is no Re-send here, because sending an
            invitation creates the account and would put the person back.
          </p>
          <ul className="mt-4 space-y-2">
            {removed.map((i) => (
              <li key={i.id} className="rounded-xl bg-gray-50 p-4">
                <p className="font-semibold text-navy">{i.full_name || i.email}</p>
                <p className="truncate text-sm text-gray-600">{i.email}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {roleNoun(i.role)} &middot; invited {ago(i.created_at)}
                  <span className="ml-1 font-semibold text-gray-600">
                    &middot; account removed
                  </span>
                </p>
                {/* Cancel only. It takes the row out of the record and frees
                    the address to be invited again, which is the deliberate
                    way back for somebody who should return -- a decision a
                    leader makes, not a retry button they press by accident. */}
                <span className="mt-2 flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmCancel(confirmCancel === i.id ? '' : i.id)}
                  >
                    {confirmCancel === i.id ? 'Keep it' : 'Remove this record'}
                  </Button>
                  {confirmCancel === i.id && (
                    <Button variant="danger" disabled={busy === i.id} onClick={() => cancel(i)}>
                      {busy === i.id ? 'Removing…' : 'Yes, remove it'}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Accepted {invites && <span className="text-gray-400">· {joined.length}</span>}
        </h2>
        {!invites ? (
          <BeaconSpinner inline label="Loading" className="mt-4" />
        ) : joined.length === 0 ? (
          <p className="mt-4 text-gray-500">Nobody has accepted an invitation yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {joined.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-navy">{i.full_name || i.email}</span>
                  <span className="block truncate text-sm text-gray-600">{i.email}</span>
                </span>
                <span className="text-sm text-green-700">✓ joined {ago(i.joined_at!)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * Send somebody away from a screen that is not theirs.
 *
 * A component rather than an effect in the page, because the redirect has to
 * happen after the role is known and React will not let a hook run
 * conditionally. `replace` rather than `push`: Back should return them to where
 * they came from, not to the screen that just turned them away.
 */
function RedirectHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/church'); }, [router]);
  return null;
}
