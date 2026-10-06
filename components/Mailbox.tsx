'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Card, Button, EmptyState, Tabs } from '@/components/ui';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import type { DemoEmail, Role } from '@/lib/types';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { safeLinkHref } from '@/lib/url';
import { ChevronGlyph } from '@/components/Glyph';

// The simulated mailbox.
//
// This build has no mail server, and an invitation that silently goes nowhere is
// the hardest part of the app to demonstrate — it is also the first thing a real
// member ever receives. So every message the app would have sent is captured and
// rendered here exactly as it would arrive.
//
// It carries one flow that is more than a preview: a missionary
// can write to the church's admins about someone waiting at the approval gate,
// and the admin approves or declines from inside that message. That is the
// workflow the production app will implement with signed links in a genuine
// email; here the button simply does the thing directly.

const KIND: Record<
  DemoEmail['kind'],
  { label: string; icon: string; cta: string }
> = {
  invite: { label: 'Invitation', icon: '✉️', cta: 'Set my password' },
  approved: { label: 'Account approved', icon: '✅', cta: 'Sign in' },
  paired: { label: 'Paired', icon: '🤝', cta: 'Open Beacon' },
  reset: { label: 'Password reset', icon: '🔑', cta: 'Choose a new password' },
  meeting: { label: 'Meeting', icon: '📅', cta: 'See the details' },
  recommendation: { label: 'Needs your decision', icon: '🙋', cta: '' },
};

type Box = 'inbox' | 'sent' | 'all';

export function Mailbox() {
  const { db, currentUser, markEmailOpened, clearEmails } = useDemo();
  const me = currentUser!;
  const [box, setBox] = useState<Box>('inbox');
  const [openId, setOpenId] = useState('');

  const isAdmin = me.role === 'admin' || me.role === 'executive';
  // Only a missionary recommends. The Church Board has no account.
  const canRecommend = me.role === 'dm';

  const all = [...db.emails].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const inbox = all.filter((e) => e.to_user_id === me.id);
  const sent = all.filter((e) => e.from_user_id === me.id);
  const list = box === 'inbox' ? inbox : box === 'sent' ? sent : all;

  const unread = inbox.filter((e) => !e.opened_at).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
        📮 <strong>Simulated mail.</strong> Nothing leaves your device in this
        build. Every message the app would have sent is shown exactly as it would
        arrive, so you can read the wording and follow the links without a mail
        server.
      </div>

      {/* Which folder you are in, in a sentence. "Everyone's mail" sits beside
          Inbox and Sent and used to be called "All mail", which reads as a
          third folder of YOUR mail — an Executive asked why they had been
          invited to a church as a seeker, when what they were looking at was
          somebody else's invitation in the system-wide list. */}
      {box === 'all' && (
        <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">
          Every message the app has sent to anyone in this sample church, not
          your own mail. Your own is under <strong>Inbox</strong>.
        </p>
      )}

      {canRecommend && <Recommend />}

      <Tabs<Box>
        active={box}
        onChange={setBox}
        tabs={[
          { key: 'inbox', label: 'Inbox', icon: '📥', badge: unread },
          { key: 'sent', label: 'Sent', icon: '📤' },
          ...(isAdmin
            ? [{ key: 'all' as Box, label: 'Everyone’s mail', icon: '📬' }]
            : []),
        ]}
      />

      {list.length === 0 ? (
        <EmptyState
          title={box === 'sent' ? 'Nothing sent yet' : 'No mail yet'}
          hint={
            canRecommend
              ? 'Recommend someone above and it appears in the admin’s inbox.'
              : 'Invite someone, or approve a sign-up, and the message appears here.'
          }
        />
      ) : (
        <>
          {isAdmin && box === 'all' && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (confirm('Empty the simulated mailbox?')) clearEmails();
                }}
                className="text-sm font-semibold text-gray-500 underline"
              >
                Empty mailbox
              </button>
            </div>
          )}
          <div className="space-y-3">
            {list.map((m) => (
              <Letter
                key={m.id}
                m={m}
                open={openId === m.id}
                onToggle={() => {
                  const next = openId === m.id ? '' : m.id;
                  setOpenId(next);
                  if (next) markEmailOpened(m.id);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Letter({
  m,
  open,
  onToggle,
}: {
  m: DemoEmail;
  open: boolean;
  onToggle: () => void;
}) {
  const { db, currentUser, actOnEmail, inviteRecommended, declineRecommendation } =
    useDemo();
  const me = currentUser!;
  const k = KIND[m.kind];
  const isAdmin = me.role === 'admin' || me.role === 'executive';

  // An actionable message: addressed to me, about someone, not yet decided.
  const actionable =
    m.kind === 'recommendation' &&
    isAdmin &&
    m.to_user_id === me.id &&
    !m.action_taken &&
    db.profiles.some((p) => p.id === m.about_profile_id);

  // The new recommendation is about somebody with no account, so there is no
  // profile to approve — there is a name to invite. Same message, same two
  // answers, decided from inside it exactly as before.
  const rec =
    m.recommendation_id && isAdmin && m.to_user_id === me.id
      ? db.recommendations.find((r) => r.id === m.recommendation_id)
      : undefined;

  // The call-to-action's destination, checked before it can become an href.
  //
  // Today every value here is composed by the app itself and is a path in this
  // same app, so nothing hostile can reach it. That is a fact about the current
  // wiring, not a property of the code — the moment a fork has a server compose
  // these messages, this becomes a link somebody else chose, rendered inside a
  // message the reader believes came from their church. Guarding it now costs a
  // line; guarding it later requires noticing.
  const cta = safeLinkHref(m.link);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="tap flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-2xl" aria-hidden>
          {k.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-navy">{m.subject}</span>
            {!m.opened_at && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                New
              </span>
            )}
            {m.action_taken && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  m.action_taken === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {m.action_taken === 'approved' ? 'Approved' : 'Declined'}
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-gray-500">
            From {m.from_name} · to {m.to_name}
          </span>
          <span className="block text-xs text-gray-500">
            {k.label} ·{' '}
            {new Date(m.created_at).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </span>
        <span className="shrink-0 text-2xl text-gray-300" aria-hidden>
          <ChevronGlyph open={open} size={18} />
        </span>
      </button>

      {open && (
        <div className="border-t border-black/5 bg-gray-50 p-4">
          <div className="mx-auto max-w-md overflow-hidden rounded-xl bg-white ring-1 ring-black/10">
            <div className="px-5 py-4 text-white" style={{ backgroundColor: NAVY }}>
              <p className="flex items-center gap-2 text-lg font-extrabold"><SentryBeaconMark size={22} /> {APP_SHORT_NAME}</p>
              <p className="text-xs text-white/60">{db.church_name}</p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <p className="whitespace-pre-wrap text-navy">{m.body}</p>

              {actionable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    className="px-4 text-base"
                    onClick={() => actOnEmail(m.id, 'approve')}
                  >
                    ✓ Approve
                  </Button>
                  <button
                    onClick={() => {
                      const who =
                        db.profiles.find((p) => p.id === m.about_profile_id)
                          ?.full_name ?? 'this sign-up';
                      if (confirm(`Decline ${who}? Their sign-up is removed.`))
                        actOnEmail(m.id, 'disapprove');
                    }}
                    className="tap rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Decline
                  </button>
                </div>
              )}

              {rec && rec.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="gold"
                    className="px-4 text-base"
                    onClick={() => inviteRecommended(rec.id)}
                  >
                    ✉️ Invite {rec.full_name.split(' ')[0]}
                  </Button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Not invite ${rec.full_name}? ${m.from_name} will be told you decided not to for now.`,
                        )
                      )
                        declineRecommendation(rec.id);
                    }}
                    className="tap rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Not now
                  </button>
                </div>
              )}

              {rec && rec.status !== 'pending' && (
                <p
                  className={`text-sm font-semibold ${
                    rec.status === 'invited' ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {rec.status === 'invited'
                    ? `✓ Invited. ${rec.full_name.split(' ')[0]} joins paired with ${m.from_name.split(' ')[0]}.`
                    : 'Declined from this message.'}
                </p>
              )}

              {m.kind === 'recommendation' && m.action_taken && (
                <p
                  className={`text-sm font-semibold ${
                    m.action_taken === 'approved'
                      ? 'text-green-600'
                      : 'text-gray-500'
                  }`}
                >
                  {m.action_taken === 'approved'
                    ? '✓ Approved from this message.'
                    : 'Declined from this message.'}
                </p>
              )}

              {cta && k.cta && (
                <a
                  href={cta}
                  className="tap inline-flex items-center justify-center rounded-xl px-5 text-base font-bold"
                  style={{ backgroundColor: '#E8B84B', color: '#1E2A4A' }}
                >
                  {k.cta}
                </a>
              )}

              <p className="text-xs text-gray-500">
                Sent by {db.church_name} through Beacon. If you were not
                expecting this, you can ignore it.
              </p>
            </div>
          </div>

          {m.link && (
            <div className="mx-auto mt-3 max-w-md">
              <p className="mb-1 text-xs font-semibold text-gray-500">
                The link this button carries
              </p>
              <input
                readOnly
                value={m.link}
                onFocus={(e) => e.currentTarget.select()}
                className="tap w-full min-w-0 rounded-xl bg-white px-3 text-sm ring-1 ring-black/10"
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// A missionary putting a name forward to the admin.
//
// This used to be a dropdown of people who had already signed up, which could
// not do the thing the client described at all: their seeker has no account —
// that is the entire premise. "DMs recommend DS with an email address and name,
// etc, which admin notifies." So it takes a name and an email, and the person
// on the other end of it has never opened the app.
//
// The missionary still cannot invite. They recommend; the admin invites. When
// the admin does, this missionary is carried onto the invite so the pairing
// exists the moment the seeker signs up.
function Recommend() {
  const { db, currentUser, sendRecommendation } = useDemo();
  const me = currentUser!;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState('');

  const admins = db.profiles.filter(
    (p) => p.role === 'admin' || p.role === 'executive',
  );
  const mine = db.recommendations.filter((r) => r.dm_id === me.id);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSend = name.trim().length > 1 && validEmail;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">
        🙋 Recommend someone to the admin
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Know someone who would welcome a companion on this journey? Send their
        name and email to{' '}
        {admins.length === 1 ? admins[0].full_name : `your ${admins.length} admins`}
        . If they invite them, that person joins already paired with you.
      </p>

      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setSent(''); }}
          placeholder="Their full name"
          aria-label="Their full name"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <input
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSent(''); }}
          placeholder="Their email address"
          aria-label="Their email address"
          type="email"
          inputMode="email"
          autoComplete="off"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why them? (optional)"
          aria-label="Why them"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <Button
            variant="gold"
            disabled={!canSend}
            onClick={() => {
              sendRecommendation(name, email, note);
              setSent(name.trim());
              setName('');
              setEmail('');
              setNote('');
            }}
          >
            Send to the admin
          </Button>
          {email.trim() && !validEmail && (
            <span className="ml-3 text-sm text-gray-500">
              That email does not look right yet.
            </span>
          )}
          {sent && (
            <span className="ml-3 font-semibold text-green-600">
              ✓ Sent. {sent} is with your admin now.
            </span>
          )}
        </div>
      </div>

      {/* A missionary who hears nothing back assumes the app ate it. */}
      {mine.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-gray-500">
            People you have recommended
          </p>
          <div className="space-y-1">
            {mine.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-navy">{r.full_name}</span>
                <span className="text-gray-500">{r.email}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                    r.status === 'invited'
                      ? 'bg-green-100 text-green-700'
                      : r.status === 'declined'
                        ? 'bg-gray-200 text-gray-600'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {r.status === 'invited'
                    ? 'Invited'
                    : r.status === 'declined'
                      ? 'Not this time'
                      : 'With the admin'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
