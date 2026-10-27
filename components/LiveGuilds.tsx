'use client';

// Guilds: the Directors' room for grouping Guides and Explorers, and the
// numbers that say whether those groups are actually alive.
//
// A pairing is one Guide and one Explorer. That is right for discipleship and
// useless for everything a church does in groups — a campus, a cohort, a
// Sabbath team. A guild is that grouping with a name a Director chooses, and
// the naming is the part that matters to the people in it.
//
// WHAT THE BADGES MEAN, spelled out on the screen rather than left to colour.
// A leader who cannot say what "thriving" measures will eventually trust it
// when it is wrong. The rules live in guild_metrics() (migration 0029) so the
// word and the number can never drift apart:
//
//   thriving  somebody wrote in the last 14 days, every Explorer has a Guide,
//             nobody is suspended
//   steady    written to in the last 45 days, nobody suspended
//   watch     somebody is suspended, OR an Explorer here has no Guide
//   stagnant  nothing written in 45 days, or the guild is empty
//
// 'watch' outranks 'thriving' on purpose. Twenty happy members and one Explorer
// nobody is walking with is not a healthy guild — the one is the reason to
// look at the screen at all.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_GUILDS } from '@/lib/live/keep-up';
import type { Profile } from '@/lib/types';
import * as live from '@/lib/live/data';
import { roleNoun } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';

const HEALTH: Record<string, { label: string; className: string }> = {
  thriving: { label: 'Thriving', className: 'bg-green-100 text-green-900' },
  steady:   { label: 'Steady',   className: 'bg-blue-100 text-blue-900' },
  watch:    { label: 'Needs a look', className: 'bg-amber-100 text-amber-900' },
  stagnant: { label: 'Stagnant', className: 'bg-gray-200 text-gray-700' },
};

function when(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
}

export function LiveGuilds({ me }: { me: Profile }) {
  const [guilds, setGuilds] = useState<live.Guild[] | null>(null);
  const [metrics, setMetrics] = useState<live.GuildMetric[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [openGuild, setOpenGuild] = useState('');
  const [rename, setRename] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [g, m, people] = await Promise.all([
        live.listGuilds(),
        live.guildMetrics().catch(() => [] as live.GuildMetric[]),
        live.listMembers().catch(() => [] as Profile[]),
      ]);
      setGuilds(g);
      setMetrics(m);
      setMembers(people.filter((p) => p.role === 'dm' || p.role === 'ds'));
    } catch (cause) {
      setGuilds([]);
      setError(humanError(cause, 'Could not load the guilds.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_GUILDS, load);

  const run = async (key: string, fn: () => Promise<string>, ok: string) => {
    setBusy(key); setError(''); setNotice('');
    try {
      const verdict = await fn();
      // These return a sentence when they refuse. Never swallow it.
      if (verdict !== 'ok') { setError(verdict); return; }
      setNotice(ok);
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That did not work.'));
    } finally { setBusy(''); }
  };

  const make = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy('new'); setError(''); setNotice('');
    try {
      await live.createGuild(name.trim(), description.trim() || undefined);
      setNotice(`“${name.trim()}” is ready. Add Guides and Explorers to it below.`);
      setName(''); setDescription('');
      await load();
    } catch (cause) {
      setError(humanError(cause, 'Could not make the guild.'));
    } finally { setBusy(''); }
  };

  const metricFor = (id: string) => metrics.find((m) => m.id === id);

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🛡️ Guilds</h2>
      <p className="mt-1 text-sm text-gray-500">
        Group your Guides and Explorers and give the group a name: a campus, a
        cohort, a Sabbath team. Everyone in a guild keeps their own private
        conversation; a guild does not join anybody&apos;s messages together.
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
      {notice && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-800 ring-1 ring-green-300">{notice}</p>}

      <form onSubmit={make} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-navy">Name the guild</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Palawan Campus"
            className="tap mt-1 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-navy">
            What is it for? <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Students meeting Tuesday evenings"
            className="tap mt-1 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy === 'new' || !name.trim()}>Make the guild</Button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {!guilds ? (
          <BeaconSpinner inline label="Loading" />
        ) : guilds.length === 0 ? (
          <p className="text-gray-500">No guilds yet. Make the first one above.</p>
        ) : (
          guilds.map((g) => {
            const m = metricFor(g.id);
            const health = m ? HEALTH[m.health] ?? HEALTH.stagnant : null;
            const inGuild = new Set(g.members.map((p) => p.id));
            const canAdd = members.filter((p) => !inGuild.has(p.id));
            return (
              <div key={g.id} className="rounded-xl bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy">
                      {g.name}
                      {health && (
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${health.className}`}>
                          {health.label}
                        </span>
                      )}
                    </span>
                    {g.description && <span className="block text-sm text-gray-600">{g.description}</span>}
                    <span className="mt-1 block text-sm text-gray-500">
                      {g.member_count} member{g.member_count === 1 ? '' : 's'} ·{' '}
                      {g.guides} {g.guides === 1 ? 'Guide' : 'Guides'} ·{' '}
                      {g.explorers} {g.explorers === 1 ? 'Explorer' : 'Explorers'}
                    </span>
                  </span>
                  <Button variant="ghost" onClick={() => setOpenGuild(openGuild === g.id ? '' : g.id)}>
                    {openGuild === g.id ? 'Done' : 'Manage'}
                  </Button>
                </div>

                {m && (
                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Messages, 30 days" value={m.messages_30d} />
                    <Stat label="Last activity" value={when(m.last_activity_at)} />
                    <Stat label="Explorers with no Guide" value={m.unpaired_explorers}
                          warn={m.unpaired_explorers > 0} />
                    <Stat label="Suspended" value={m.suspended} warn={m.suspended > 0} />
                    {m.removed_ever > 0 && (
                      <Stat label="Removed over time" value={m.removed_ever} />
                    )}
                  </dl>
                )}

                {openGuild === g.id && (
                  <div className="mt-4 border-t border-black/5 pt-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-navy">Rename this guild</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <input
                          value={rename[g.id] ?? g.name}
                          onChange={(e) => setRename((r) => ({ ...r, [g.id]: e.target.value }))}
                          className="tap min-w-0 flex-1 rounded-xl bg-white px-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                        />
                        <Button variant="ghost" disabled={busy === g.id}
                                onClick={() => void run(g.id,
                                  () => live.renameGuild(g.id, rename[g.id] ?? g.name),
                                  'The guild has its new name.')}>
                          Rename
                        </Button>
                      </div>
                    </label>

                    <div className="mt-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                        Who is in it
                      </h4>
                      {g.members.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-500">Nobody yet.</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {g.members.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                              <span className="font-semibold text-navy">{p.name}</span>
                              <span className="text-gray-500">{roleNoun(p.role)}</span>
                              <span className="ml-auto">
                                <Button variant="ghost" disabled={busy === `${g.id}-${p.id}`}
                                        onClick={() => void run(`${g.id}-${p.id}`,
                                          () => live.removeFromGuild(g.id, p.id),
                                          `${p.name} is no longer in ${g.name}.`)}>
                                  Take out
                                </Button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-4">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                        Add somebody
                      </h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select
                          value={pick[g.id] ?? ''}
                          onChange={(e) => setPick((s) => ({ ...s, [g.id]: e.target.value }))}
                          className="tap min-w-0 flex-1 rounded-xl bg-white px-3 text-base outline-none ring-1 ring-gray-300 focus:ring-2 focus:ring-gold"
                        >
                          <option value="">Choose a Guide or Explorer…</option>
                          {canAdd.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name} · {roleNoun(p.role)}
                            </option>
                          ))}
                        </select>
                        <Button variant="gold"
                                disabled={busy === `add-${g.id}` || !pick[g.id]}
                                onClick={() => void run(`add-${g.id}`,
                                  () => live.addToGuild(g.id, pick[g.id]),
                                  'Added to the guild.')}>
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-black/5 pt-3">
                      <Button variant="danger" disabled={busy === `del-${g.id}`}
                              onClick={() => {
                                if (!confirm(`Delete the guild “${g.name}”? The people in it are not affected.`)) return;
                                void run(`del-${g.id}`, () => live.deleteGuild(g.id),
                                  `“${g.name}” is gone. Nobody was removed from the church.`);
                              }}>
                        Delete this guild
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${warn ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-white'}`}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-lg font-bold ${warn ? 'text-amber-900' : 'text-navy'}`}>{value}</dd>
    </div>
  );
}

/**
 * The whole church in one row, for the people whose job is to notice.
 *
 * Available to Directors and Executive Directors alike — a Director who cannot
 * see their own church's totals cannot do the job. The difference is reach: an
 * Executive Director oversees more than one church, so church_pulse() gives
 * them a row for each, and this renders all of them.
 */
export function LiveChurchPulse() {
  const [rows, setRows] = useState<live.ChurchPulse[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try { setRows(await live.churchPulse()); }
      catch (cause) {
        setRows([]);
        setError(humanError(cause, 'Could not load the numbers.'));
      }
    })();
  }, []);

  if (rows && rows.length === 0 && !error) return null;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📊 How the church is doing</h2>
      <p className="mt-1 text-sm text-gray-500">
        Counts only. Nothing here names an Explorer or shows anybody&apos;s messages.
      </p>
      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}
      {!rows ? (
        <BeaconSpinner inline label="Loading" className="mt-3" />
      ) : (
        rows.map((r) => (
          <div key={r.church_id} className="mt-4">
            {rows.length > 1 && <h3 className="font-semibold text-navy">{r.church_name}</h3>}
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Directors" value={r.directors} />
              <Stat label="Guides" value={r.guides} />
              <Stat label="Explorers" value={r.explorers} />
              <Stat label="Waiting for approval" value={r.awaiting_approval} warn={r.awaiting_approval > 0} />
              <Stat label="Active pairings" value={r.active_pairings} />
              <Stat label="Explorers with no Guide" value={r.unpaired_explorers} warn={r.unpaired_explorers > 0} />
              <Stat label="Guilds" value={r.guilds_total} />
              <Stat label="Guilds gone quiet" value={r.guilds_stagnant} warn={r.guilds_stagnant > 0} />
              <Stat label="Messages, 7 days" value={r.messages_7d} />
              <Stat label="Messages, 30 days" value={r.messages_30d} />
              <Stat label="Suspended now" value={r.suspended_now} warn={r.suspended_now > 0} />
              <Stat label="Removed over time" value={r.removed_ever} />
              <Stat label="Reports to answer" value={r.open_reports} warn={r.open_reports > 0} />
            </dl>
          </div>
        ))
      )}
    </Card>
  );
}
