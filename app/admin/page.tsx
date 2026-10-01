'use client';

import { useState } from 'react';
import { SubroomMenu } from '@/components/SubroomMenu';
import { useDemo } from '@/lib/demo/store';
import { Analytics } from '@/components/DemoAnalytics';
import { emitQuest } from '@/lib/quest';
import { LessonSeriesLibrary } from '@/components/LessonSeriesLibrary';
import { useLocale } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { InviteManager } from '@/components/InviteManager';
import { Mailbox } from '@/components/Mailbox';
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui';
import { roleLabel, STAGES, stageInfo, canKick } from '@/lib/brand';
import type { MaterialType, Role, Track } from '@/lib/types';
import { relTime } from '@/lib/activity';
import { useIsLive } from '@/lib/tutorial';
import { LiveAdminPage } from '@/components/LiveCorePages';

export default function Admin() {
  if (useIsLive()) return <LiveAdminPage />;
  return (
    // Executives too, which they were not.
    //
    // AppShell.NAV sends an executive here, app/login sends an executive here,
    // and this guard then bounced them straight back to the login screen. The
    // role was unusable end to end and nobody had seen it, because there was no
    // executive persona in the seed to sign in as. Adding one for the executive
    // tutorial is what surfaced it: the walk opened /admin and found an empty
    // page with not a single control on it.
    <AppShell allow={['admin', 'executive']}>
      <AdminBody />
    </AppShell>
  );
}

type Tab = 'approvals' | 'pairing' | 'materials' | 'outbox' | 'reports' | 'analytics';

function AdminBody() {
  const { db } = useDemo();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('approvals');
  const pending = db.profiles.filter((p) => !p.is_approved).length;
  const recs = db.recommendations.filter((r) => r.status === 'pending').length;
  const unopened = db.emails.filter(
    (e) => !e.opened_at && e.to_user_id === undefined,
  ).length;
  const openReports = db.reports.filter((r) => r.status === 'open').length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'approvals', label: t('approvals'), badge: pending + recs },
    { key: 'pairing', label: t('peoplePairing') },
    { key: 'materials', label: t('materials') },
    { key: 'outbox', label: 'Mail', badge: unopened },
    // Its own tab rather than a card inside Approvals. A safeguarding report
    // that shares a screen with routine admin gets treated as routine admin.
    { key: 'reports', label: 'Safeguarding', badge: openReports },
    { key: 'analytics', label: t('analytics') },
  ];

  return (
    <div>
      <h1 className="mb-1 text-3xl font-extrabold text-navy">{t('admin')}</h1>
      <p className="mb-5 text-gray-500">
        Approve members, pair Guides with Explorers, and manage the library.
      </p>

      {/* THE ROOMS OF ADMIN, AS ONE DROP-DOWN, like every other set of
          sub-rooms since 30 September 2026 (components/SubroomMenu.tsx) and
          like the live Admin page. The counts stay red: they are things to
          clear, and the closed button carries the ones in other rooms. */}
      <div className="mb-6">
        <SubroomMenu
          label="Rooms"
          quest="admin-rooms"
          active={tab}
          onChoose={(key) => {
            setTab(key as Tab);
            // The tutorial listens rather than the tabs knowing about it.
            emitQuest(`beacon:tab-${key}`);
          }}
          items={tabs.map((t) => ({
            id: t.key,
            label: t.label,
            text: t.label,
            badge: t.badge,
            tone: 'urgent',
            quest: `tab-${t.key}`,
          }))}
        />
      </div>

      {tab === 'approvals' && (
        <div className="space-y-6">
          <Recommendations />
          <Approvals />
        </div>
      )}
      {tab === 'pairing' && <Pairing />}
      {tab === 'materials' && <Materials />}
      {tab === 'outbox' && <Mailbox />}
      {tab === 'reports' && <Reports />}
      {tab === 'analytics' && <Analytics />}
    </div>
  );
}


// Two scopes, deliberately separated:
//   • LOCAL — detailed, per-person behaviour that stays on this device. This is
//     the church's own data to analyze; it names people.
//   • GLOBAL — an anonymous rollup (totals + trends, no identities) that is safe
//     to sync to a shared backend for wider analysis.
/**
 * Safeguarding reports, and what a Director does about them.
 *
 * WHAT THIS SCREEN IS FOR. Somebody in this church told the leadership that
 * another member did something wrong, and did it through an app rather than in
 * person — usually because saying it in person felt impossible. The screen owes
 * them two things: that a Director sees it, and that a Director can act without
 * having to leave and go hunting for context.
 *
 * Three decisions worth defending:
 *
 *   * OPEN ONES CANNOT BE HIDDEN. No "mark as read", no collapse. A report
 *     stays at the top of this tab, with a red count on the tab itself, until
 *     somebody decides something. The failure mode for safeguarding is not
 *     wrong decisions, it is no decision.
 *   * CLOSING IT IS TWO EQUAL CHOICES. "Nothing to answer" is a real and
 *     common outcome, and making it harder to record than "removed" pushes
 *     Directors towards punishing someone to clear a queue.
 *   * NOTHING IS EVER DELETED. Closed reports stay, visible, with who decided
 *     and what they decided. A record that can be made to disappear is not a
 *     record, and the person who raised it deserves to know it still exists.
 */
function Reports() {
  const { db, userId, resolveReport, kickMember } = useDemo();
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const me = db.profiles.find((p) => p.id === userId);

  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'Someone who has left';

  const open = db.reports.filter((r) => r.status === 'open');
  const closed = db.reports.filter((r) => r.status !== 'open');

  const REASON_LABEL: Record<string, string> = {
    inappropriate: 'Something inappropriate was sent',
    harassment: 'Abuse, threats or pressure',
    unsafe: 'Worried someone is unsafe',
    spam: 'Selling, begging or recruiting',
    other: 'Something else',
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Needs a decision {open.length > 0 && <span className="text-red-600">· {open.length}</span>}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Someone in your church raised these. The person reported has not been
          told, and will not be, so anyone can raise a concern safely.
        </p>

        {open.length === 0 ? (
          <EmptyState
            title="🛡️ Nothing to decide"
            hint="Reports from Guides and Explorers arrive here. Everyone can read how this works on the How we treat each other page."
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((r) => {
              const subject = db.profiles.find((p) => p.id === r.subject_id);
              const removable = Boolean(me && subject && canKick(me.role, subject.role));
              return (
                <li key={r.id} className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                  <p className="font-bold text-navy">
                    {nameOf(r.reporter_id)} reported {nameOf(r.subject_id)}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-red-800">
                    {REASON_LABEL[r.reason] ?? r.reason}
                  </p>
                  {r.detail && (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-gray-700">
                      {r.detail}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
                  </p>

                  <label className="mt-3 block">
                    <span className="text-sm font-semibold text-navy">
                      What did you decide, and why?
                    </span>
                    <input
                      value={outcome[r.id] ?? ''}
                      onChange={(e) => setOutcome((o) => ({ ...o, [r.id]: e.target.value }))}
                      placeholder="Spoke to them / removed them / nothing to answer"
                      className="tap mt-1 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-red-200 focus:ring-2 focus:ring-gold"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => resolveReport(r.id, 'actioned', outcome[r.id])}
                    >
                      I have dealt with it
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => resolveReport(r.id, 'dismissed', outcome[r.id])}
                    >
                      Nothing to answer
                    </Button>
                    {removable && (
                      // Removing and closing in one press, because doing them
                      // separately leaves a live report against somebody who is
                      // already gone — and a Director who has just removed a
                      // member does not come back to tidy the queue.
                      <Button
                        variant="gold"
                        onClick={() => {
                          resolveReport(
                            r.id,
                            'actioned',
                            outcome[r.id] || `Removed ${nameOf(r.subject_id)} from the church.`,
                          );
                          kickMember(r.subject_id);
                        }}
                      >
                        Remove {nameOf(r.subject_id)} from the church
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">Decided</h2>
        <p className="mt-1 text-sm text-gray-500">
          Kept permanently. Reports are never deleted.
        </p>
        {closed.length === 0 ? (
          <p className="mt-4 text-gray-500">Nothing decided yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {closed.map((r) => (
              <li key={r.id} className="rounded-xl bg-gray-50 p-4">
                <p className="font-semibold text-navy">
                  {nameOf(r.reporter_id)} reported {nameOf(r.subject_id)}
                </p>
                <p className="mt-0.5 text-sm text-gray-600">
                  {REASON_LABEL[r.reason] ?? r.reason} ·{' '}
                  <span className={r.status === 'actioned' ? 'text-green-700' : 'text-gray-500'}>
                    {r.status === 'actioned' ? 'Dealt with' : 'Nothing to answer'}
                  </span>
                </p>
                {r.outcome && <p className="mt-1 text-gray-700">{r.outcome}</p>}
                <p className="mt-1 text-xs text-gray-500">
                  Decided by {r.decided_by ? nameOf(r.decided_by) : 'a Director'}
                  {r.decided_at ? ` · ${new Date(r.decided_at).toLocaleDateString()}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}




// What the church board is shown, inside the account of somebody who has one.
//
// The board used to be a separate guided walk on the sign-in screen, and the
// owner was right to cut it: "take out the church member account since they
// don't have any account in this app." Offering board members a card to tap
// implied an account that does not exist and is not being built — the board's
// approval of a missionary happens in the board's own meeting, off the app,
// which is the client's decision and still stands.
//
// But the need behind it is real. Somebody has to be able to answer "what does
// the church actually see about us" in a board meeting, and the person who will
// be asked is the admin or the executive — people who DO have accounts. So the
// board's view lives here, in their account, as something to read out or print,
// rather than as a role nobody can sign in as.
//
// It is deliberately the anonymous rollup and nothing else. Everything on this
// card is a count.



// Names a missionary has put forward. The person has no account yet, so there
// is nothing to approve — there is somebody to invite. Inviting from here
// carries the recommending missionary onto the invite, which is what makes the
// pairing exist the moment they finish signing up.
function Recommendations() {
  const { db, inviteRecommended, declineRecommendation } = useDemo();
  const pending = db.recommendations.filter((r) => r.status === 'pending');
  const decided = db.recommendations.filter((r) => r.status !== 'pending');
  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'A Guide';

  if (pending.length === 0 && decided.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">
        🙋 Recommended by your Guides
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        These people do not have accounts yet. Invite one and they join already
        paired with the Guide who put them forward.
      </p>

      {pending.length === 0 ? (
        <p className="text-gray-500">Nothing waiting on you here.</p>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl bg-gray-50 p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="font-bold text-navy">{r.full_name}</p>
                <p className="text-sm text-gray-500">{r.email}</p>
              </div>
              <p className="text-sm text-gray-500">
                Recommended by {nameOf(r.dm_id)} · {relTime(r.created_at)}
              </p>
              {r.note && (
                <p className="mt-1 text-sm italic text-gray-600">“{r.note}”</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="gold"
                  data-quest="invite-recommended"
                  onClick={() => {
                    inviteRecommended(r.id);
                    emitQuest('beacon:invite-recommended');
                  }}
                >
                  ✉️ Invite {r.full_name.split(' ')[0]}
                </Button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Not invite ${r.full_name}? ${nameOf(r.dm_id)} will be told.`,
                      )
                    )
                      declineRecommendation(r.id);
                  }}
                  className="tap rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-600 hover:bg-red-100"
                >
                  Not now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="mt-4 space-y-1">
          {decided.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
            >
              <span className="font-semibold text-navy">{r.full_name}</span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                  r.status === 'invited'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {r.status === 'invited' ? 'Invited' : 'Not this time'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Approvals() {
  const { db, approveUser, disapproveMember } = useDemo();
  const { t } = useLocale();
  const [roleChoice, setRoleChoice] = useState<Record<string, Role>>({});
  const pending = db.profiles.filter((p) => !p.is_approved);

  if (pending.length === 0)
    return <EmptyState title={t('allCaughtUp')} hint="No accounts awaiting approval." />;

  return (
    <div className="space-y-3">
      {pending.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center gap-3">
            <Avatar name={p.full_name} avatar={p.avatar} photo={p.photo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-navy">{p.full_name}</p>
              <p className="text-sm text-gray-500">
                {p.city_of_residence} · signed up{' '}
                {new Date(p.created_at).toLocaleDateString()}
              </p>
              {/* A missionary can vouch for a sign-up from their mailbox. That
                  is a note to help you decide, not a gate: approval is yours
                  alone. The Church Board's approval of missionaries happens
                  off the app entirely. */}
              {p.recommended_by && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-sm font-semibold text-green-700">
                  🙋 Recommended by{' '}
                  {db.profiles.find((x) => x.id === p.recommended_by)?.full_name ??
                    'a Guide'}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select
              value={roleChoice[p.id] ?? 'ds'}
              onChange={(e) =>
                setRoleChoice((r) => ({
                  ...r,
                  [p.id]: e.target.value as Role,
                }))
              }
              className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base"
              aria-label={`Role for ${p.full_name}`}
            >
              <option value="ds">Someone exploring</option>
              <option value="dm">Guide</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              variant="gold"
              data-quest="approve"
              onClick={() => {
                approveUser(p.id, roleChoice[p.id] ?? 'ds');
                emitQuest('beacon:approve');
              }}
            >
              {t('approve')}
            </Button>
            {/* The shared danger button: red AND smaller. This was already
                red, and still the full 56px of an ordinary control, because
                every button in the app has that floor in globals.css. */}
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Disapprove ${p.full_name}? Their sign-up will be removed.`))
                  disapproveMember(p.id);
              }}
            >
              Disapprove
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Pairing() {
  const { db, createPairing, kickMember, currentUser } = useDemo();
  const { t } = useLocale();
  const [dm, setDm] = useState('');
  const [ds, setDs] = useState('');
  const [track, setTrack] = useState<Track>('digital');

  const dms = db.profiles.filter((p) => p.role === 'dm' && p.is_approved);
  const pairedDsIds = new Set(
    db.pairings.filter((p) => p.status === 'active').map((p) => p.ds_id),
  );
  const unpairedDs = db.profiles.filter(
    (p) => p.role === 'ds' && p.is_approved && !pairedDsIds.has(p.id),
  );
  const active = db.pairings.filter((p) => p.status === 'active');

  return (
    <div className="space-y-6">
      <InviteManager />

      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold text-navy">{t('createPairing')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-gray-500">{t('guide')}</span>
            <select
              value={dm}
              onChange={(e) => setDm(e.target.value)}
              className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
            >
              <option value="">Choose a Guide…</option>
              {dms.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-500">{t('seeker')}</span>
            <select
              value={ds}
              onChange={(e) => setDs(e.target.value)}
              className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
            >
              <option value="">Choose an Explorer…</option>
              {unpairedDs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-500">{t('track')}</span>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value as Track)}
              className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
            >
              <option value="digital">Digital / online</option>
              <option value="traditional">Traditional / in-person</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button
              disabled={!dm || !ds}
              data-quest="create-pairing"
              onClick={() => {
                createPairing(dm, ds, track);
                setDm('');
                setDs('');
                emitQuest('beacon:pair');
              }}
              className="w-full"
            >
              {t('pairThem')}
            </Button>
          </div>
        </div>
        {unpairedDs.length === 0 && (
          <p className="mt-3 text-sm text-gray-400">
            Every approved Explorer is already paired.
          </p>
        )}
      </Card>

      <div>
        <h2 className="mb-3 text-xl font-bold text-navy">{t('activePairings')}</h2>
        <div className="space-y-2">
          {active.map((p) => {
            const dmP = db.profiles.find((x) => x.id === p.dm_id)!;
            const dsP = db.profiles.find((x) => x.id === p.ds_id)!;
            const info = stageInfo(p.journey_stage);
            return (
              <Card key={p.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-bold text-navy">{dsP.full_name}</p>
                  <p className="text-sm text-gray-500">
                    with {dmP.full_name}
                  </p>
                </div>
                <Badge color={info.color}>{info.label}</Badge>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-xl font-bold text-navy">Members</h2>
        <div className="space-y-2">
          {db.profiles
            .filter((p) => p.is_approved)
            .map((m) => {
              const removable =
                currentUser && m.id !== currentUser.id && canKick(currentUser.role, m.role);
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                >
                  <Avatar name={m.full_name} avatar={m.avatar} photo={m.photo} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy">{m.full_name}</p>
                    {roleLabel(m.role, currentUser?.role ?? '') && (
                      <p className="text-sm text-gray-500">{roleLabel(m.role, currentUser?.role ?? '')}</p>
                    )}
                  </div>
                  {removable && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${m.full_name} from the church? Their pairings will be archived.`,
                          )
                        )
                          kickMember(m.id);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}

function Materials() {
  const { db, addMaterial } = useDemo();
  const { t } = useLocale();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MaterialType>('link');
  const [url, setUrl] = useState('');

  return (
    <div className="space-y-6">
      {/* Series first. A single reading is something a missionary shares in
          passing; a series is a course the church has decided to teach, and it
          is the thing an admin comes to this screen to build. */}
      <LessonSeriesLibrary />

      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold text-navy">{t('addMaterial')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('title')}
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MaterialType)}
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base"
          >
            <option value="link">Link</option>
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="image">Image</option>
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link (optional)"
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button
              variant="gold"
              disabled={!title.trim()}
              onClick={() => {
                addMaterial({ title, type, external_url: url || undefined });
                setTitle('');
                setUrl('');
              }}
            >
              {t('addToLibrary')}
            </Button>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-xl font-bold text-navy">{t('library')}</h2>
        <div className="space-y-2">
          {db.materials.map((m) => (
            <Card key={m.id} className="flex items-center gap-3 p-4">
              <span className="text-2xl" aria-hidden>
                {MATERIAL_ICON[m.type]}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-navy">{m.title}</p>
                <p className="text-sm text-gray-500">{m.description}</p>
              </div>
              <span className="text-sm uppercase text-gray-400">{m.type}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

const MATERIAL_ICON: Record<string, string> = {
  pdf: '📄',
  video: '🎬',
  audio: '🎧',
  image: '🖼️',
  link: '🔗',
};
