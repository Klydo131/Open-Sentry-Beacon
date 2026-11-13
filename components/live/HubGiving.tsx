'use client';

// Keeping the hub running: the card every member sees on Home, and the
// Settings folder where Directors set giving up and treasurers record gifts.
// What each person may see and do is the database's decision
// (lib/live/giving.ts); these screens only ask.
//
// OPTIONAL. Nothing here is drawn until the project switches giving on
// (HUB_GIVING = 'on', 20261026200000_giving_is_a_choice): givingCard() answers
// null, and every component below starts from it.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { copyText } from '@/lib/share';
import { APP_NAME } from '@/lib/brand';
import { humanError } from '@/lib/live/errors';
import {
  givingCard, giftsOf, METHODS, money, monthName, nameTreasurer, recordGift, removeGift,
  removeTreasurer, saveGiving, shrinkPicture, todayInManila, treasurers,
  type Gift, type GiftMethod, type GivingCard, type Treasurer,
} from '@/lib/live/giving';

// The database's refusals are written to be read; humanError turns anything
// else (a dropped connection, a signed-out session) into words too.
const message = (cause: unknown) => humanError(cause);

// ------------------------------------------------------------------ card ---

/**
 * The card itself, drawn from what it is given: the church's card from the
 * database. Only the goal, the month's total and how to give; never a gift or
 * a giver.
 */
export function GivingCardView({ card }: { card: GivingCard }) {
  const [copied, setCopied] = useState('');
  const goal = card.monthly_goal ?? 0;
  const given = card.given_this_month ?? 0;
  const currency = card.currency ?? 'PHP';
  const share = goal > 0 ? Math.min(100, Math.round((given / goal) * 100)) : 0;
  const met = goal > 0 && given >= goal;

  const copy = async (what: string, text: string) => {
    setCopied((await copyText(text)) ? what : '');
  };

  return (
    <Card className="p-5" data-panel="hub-giving">
      <h2 className="text-xl font-bold text-navy">💛 Keep our Hope Hub running</h2>
      {card.purpose && <p className="mt-1 text-sm text-gray-600">{card.purpose}</p>}

      <p className="mt-4 text-lg font-bold text-navy" data-hub-giving-total>
        {monthName(card.month ?? '')}: {money(given, currency)} of {money(goal, currency)}
      </p>
      <div
        role="progressbar"
        aria-label="Given this month"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={share}
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-100"
      >
        <div className="h-full rounded-full bg-gold" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-2 text-sm text-gray-600">
        {met
          ? 'This month is covered. Thank you.'
          : `${money(Math.max(0, goal - given), currency)} still to go this month.`}
      </p>

      <h3 className="mt-5 font-bold text-navy">How to give</h3>
      <p className="text-sm text-gray-600">
        Give through the church, as with any offering. The treasurer records each gift;
        nobody else sees who gave.
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        {card.qr_image && (
          // A data: picture the database has already checked; nothing is fetched.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.qr_image}
            alt="GCash QR code for the church"
            className="h-40 w-40 shrink-0 rounded-xl bg-white object-contain ring-1 ring-gray-200"
          />
        )}
        <dl className="min-w-0 space-y-3 text-sm">
          {card.gcash_number && (
            <div>
              <dt className="font-semibold text-navy">GCash</dt>
              <dd className="break-words">
                {card.gcash_name && <span className="block">{card.gcash_name}</span>}
                <span className="font-mono text-base">{card.gcash_number}</span>
                <button
                  type="button"
                  onClick={() => void copy('gcash', card.gcash_number ?? '')}
                  className="tap-sm ml-2 rounded-full px-3 text-sm font-bold text-navy ring-1 ring-navy/20"
                >
                  {copied === 'gcash' ? 'Copied' : 'Copy'}
                </button>
              </dd>
            </div>
          )}
          {card.bank_account_number && (
            <div>
              <dt className="font-semibold text-navy">Bank{card.bank_name ? `: ${card.bank_name}` : ''}</dt>
              <dd className="break-words">
                {card.bank_account_name && <span className="block">{card.bank_account_name}</span>}
                <span className="font-mono text-base">{card.bank_account_number}</span>
                <button
                  type="button"
                  onClick={() => void copy('bank', card.bank_account_number ?? '')}
                  className="tap-sm ml-2 rounded-full px-3 text-sm font-bold text-navy ring-1 ring-navy/20"
                >
                  {copied === 'bank' ? 'Copied' : 'Copy'}
                </button>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}

/** Home's card in the live app. Not drawn until the church has set giving up. */
export function LiveHubGivingCard() {
  const [card, setCard] = useState<GivingCard | null>(null);
  useEffect(() => { givingCard().then(setCard).catch(() => setCard(null)); }, []);
  if (!card) return null;
  if (!card.set_up) {
    // Only a Director is told it exists before it is set up.
    if (!card.i_lead) return null;
    return (
      <Card className="p-5" data-panel="hub-giving-not-set-up">
        <h2 className="text-lg font-bold text-navy">💛 Members can help keep the app running</h2>
        <p className="mt-1 text-sm text-gray-600">
          Show your church how to give toward the app&rsquo;s monthly cost, and how close each month is.
        </p>
        <Link
          href="/settings#giving"
          className="tap-sm mt-3 inline-flex items-center rounded-full bg-gold px-4 text-sm font-bold text-navy"
        >
          Set up giving
        </Link>
      </Card>
    );
  }
  return <GivingCardView card={card} />;
}

// -------------------------------------------------------- settings folder ---

/** Whether this person gets the Giving folder in Settings, and the card behind it. */
export function useGivingAccess(): GivingCard | null {
  const [card, setCard] = useState<GivingCard | null>(null);
  useEffect(() => { givingCard().then(setCard).catch(() => setCard(null)); }, []);
  return card;
}

/** The Giving folder: setup and treasurers for a Director, the gift book for a treasurer. */
export function LiveGivingRoom({ card: first }: { card: GivingCard }) {
  const [card, setCard] = useState<GivingCard>(first);
  const reload = useCallback(async () => {
    const next = await givingCard().catch(() => null);
    if (next) setCard(next);
  }, []);
  return (
    <div className="space-y-6" id="giving">
      {card.i_lead && <GivingSetup card={card} onSaved={reload} />}
      {card.i_lead && <TreasurersCard onChanged={reload} />}
      {card.i_keep_the_books && card.set_up && <GiftBook card={card} onChanged={reload} />}
      {card.set_up && <GivingCardView card={card} />}
    </div>
  );
}

const field = 'tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold';

function GivingSetup({ card, onSaved }: { card: GivingCard; onSaved: () => Promise<void> }) {
  const [goal, setGoal] = useState(String(card.monthly_goal ?? 1710));
  const [currency, setCurrency] = useState(card.currency ?? 'PHP');
  const [purpose, setPurpose] = useState(card.purpose ?? `Our ${APP_NAME} app: the database it runs on, its backups and its email.`);
  const [gcashName, setGcashName] = useState(card.gcash_name ?? '');
  const [gcashNumber, setGcashNumber] = useState(card.gcash_number ?? '');
  const [bankName, setBankName] = useState(card.bank_name ?? '');
  const [bankAccountName, setBankAccountName] = useState(card.bank_account_name ?? '');
  const [bankAccountNumber, setBankAccountNumber] = useState(card.bank_account_number ?? '');
  const [qr, setQr] = useState<string | null>(card.qr_image ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    try {
      const amount = Number(goal.replace(/[,\s]/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Type the monthly goal as a number, such as 1710.');
      await saveGiving({
        currency, monthly_goal: amount, purpose, gcash_name: gcashName, gcash_number: gcashNumber,
        bank_name: bankName, bank_account_name: bankAccountName, bank_account_number: bankAccountNumber,
        qr_image: qr,
      });
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={(e) => void save(e)} data-hub-giving-setup>
        <h2 className="text-xl font-bold text-navy">💛 Giving for the app</h2>
        <p className="mt-1 text-sm text-gray-600">
          Members see the month&rsquo;s goal, how much has been given and how to give. Gifts go to the
          church&rsquo;s own accounts, never through the app. Use the church&rsquo;s accounts, not a person&rsquo;s.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
          <label className="block text-sm font-semibold text-navy">
            Monthly goal
            <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} className={field} data-giving-goal />
          </label>
          <label className="block text-sm font-semibold text-navy">
            Currency
            <input
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              className={field}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          The standard plan is about ₱1,710 a month: Supabase Pro, $25, plus 12% GST.
        </p>
        <label className="mt-4 block text-sm font-semibold text-navy">
          What it pays for (one line)
          <input value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} className={field} />
        </label>

        <h3 className="mt-5 font-bold text-navy">GCash</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-navy">
            Account name
            <input value={gcashName} maxLength={80} onChange={(e) => setGcashName(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-semibold text-navy">
            Number
            <input inputMode="tel" value={gcashNumber} maxLength={20} onChange={(e) => setGcashNumber(e.target.value)} className={field} data-giving-gcash />
          </label>
        </div>
        <div className="mt-3">
          <span className="block text-sm font-semibold text-navy">QR code (optional)</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="The church's GCash QR code" className="h-24 w-24 rounded-lg bg-white object-contain ring-1 ring-gray-200" />
            )}
            <label className="tap-sm inline-flex cursor-pointer items-center rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20">
              {qr ? 'Change picture' : 'Add picture'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                data-giving-qr
                onChange={async (e) => {
                  const input = e.target;
                  const file = input.files?.[0];
                  if (!file) return;
                  // Cleared only once the picture is read: clearing at once
                  // aborts the read on WebKit (tests/security-invariants.mjs).
                  try { setQr(await shrinkPicture(file)); setError(''); } catch (cause) { setError(message(cause)); }
                  finally { input.value = ''; }
                }}
              />
            </label>
            {qr && (
              <button type="button" onClick={() => setQr(null)} className="tap-sm rounded-full px-4 text-sm font-bold text-red-700 ring-1 ring-red-300">
                Remove picture
              </button>
            )}
          </div>
        </div>

        <h3 className="mt-5 font-bold text-navy">Bank (optional)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-semibold text-navy">
            Bank
            <input value={bankName} maxLength={80} onChange={(e) => setBankName(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-semibold text-navy">
            Account name
            <input value={bankAccountName} maxLength={80} onChange={(e) => setBankAccountName(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-semibold text-navy">
            Account number
            <input value={bankAccountNumber} maxLength={34} onChange={(e) => setBankAccountNumber(e.target.value)} className={field} />
          </label>
        </div>

        <div className="mt-5">
          <Button type="submit" variant="gold" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
        {saved && <p className="mt-2 font-semibold text-green-600" role="status">✓ Saved. Members see it on Home.</p>}
        {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      </form>
    </Card>
  );
}

function TreasurersCard({ onChanged }: { onChanged: () => Promise<void> }) {
  const [list, setList] = useState<{ treasurers: Treasurer[]; candidates: Treasurer[] } | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setList(await treasurers()); setError(''); } catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); await load(); await onChanged(); } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5" data-panel="hub-treasurers">
      <h2 className="text-xl font-bold text-navy">Treasurers</h2>
      <p className="mt-1 text-sm text-gray-600">
        Treasurers record each gift as it reaches the church, and are the only ones who see each gift.
      </p>
      {list && list.treasurers.length === 0 && (
        <p className="mt-3 text-sm font-semibold text-navy">Nobody yet. Name the church treasurer below.</p>
      )}
      <ul className="mt-3 space-y-2">
        {list?.treasurers.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-navy">{t.name || 'Unnamed member'}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => removeTreasurer(t.id))}
              className="tap-sm rounded-full px-4 text-sm font-bold text-red-700 ring-1 ring-red-300 disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {list && list.candidates.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 text-sm font-semibold text-navy">
            Name a treasurer
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={field} data-giving-pick>
              <option value="">Choose a member</option>
              {list.candidates.map((c) => <option key={c.id} value={c.id}>{c.name || 'Unnamed member'}</option>)}
            </select>
          </label>
          <Button variant="gold" disabled={busy || !pick} onClick={() => void act(async () => { await nameTreasurer(pick); setPick(''); })}>
            Name
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </Card>
  );
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function GiftBook({ card, onChanged }: { card: GivingCard; onChanged: () => Promise<void> }) {
  const thisMonth = card.month ?? todayInManila().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [book, setBook] = useState<{ month: string; total: number; gifts: Gift[] } | null>(null);
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(todayInManila());
  const [method, setMethod] = useState<GiftMethod>('gcash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const currency = card.currency ?? 'PHP';

  const load = useCallback(async (which: string) => {
    try { setBook(await giftsOf(which)); setError(''); } catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(month); }, [load, month]);

  const record = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setDone('');
    try {
      const value = Number(amount.replace(/[,\s]/g, ''));
      if (!Number.isFinite(value) || value <= 0) throw new Error('Type the amount as a number, such as 500.');
      await recordGift({ amount: value, received_on: day, method, note });
      setAmount(''); setNote('');
      setDone(`Recorded ${money(value, currency)}.`);
      await load(month);
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5" data-panel="hub-gift-book">
      <h2 className="text-xl font-bold text-navy">📒 Record a gift</h2>
      <p className="mt-1 text-sm text-gray-600">
        Record each gift once it reaches the church&rsquo;s account. No giver&rsquo;s name is kept here;
        receipts stay in the church&rsquo;s own books.
      </p>
      <form onSubmit={(e) => void record(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-navy">
          Amount ({currency})
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} data-gift-amount />
        </label>
        <label className="block text-sm font-semibold text-navy">
          Day it came
          <input type="date" value={day} max={todayInManila()} onChange={(e) => setDay(e.target.value)} className={field} />
        </label>
        <label className="block text-sm font-semibold text-navy">
          How it came
          <select value={method} onChange={(e) => setMethod(e.target.value as GiftMethod)} className={field}>
            {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-navy">
          Note (optional, such as a GCash reference)
          <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={field} />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" variant="gold" disabled={busy || !amount.trim()}>{busy ? 'Recording…' : 'Record gift'}</Button>
        </div>
      </form>
      {done && <p className="mt-2 font-semibold text-green-600" role="status">✓ {done}</p>}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-navy" data-gift-book-total>
          {monthName(month)}: {money(book?.total ?? 0, currency)}
        </h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMonth(previousMonth(month))} className="tap-sm rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20">
            ← Earlier
          </button>
          {month !== thisMonth && (
            <button type="button" onClick={() => setMonth(thisMonth)} className="tap-sm rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20">
              This month
            </button>
          )}
        </div>
      </div>
      {book && book.gifts.length === 0 && <p className="mt-2 text-sm text-gray-500">No gifts recorded this month.</p>}
      <ul className="mt-2 divide-y divide-gray-100">
        {book?.gifts.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-gift-row>
            <span className="min-w-0">
              <span className="font-semibold text-navy">{money(g.amount, currency)}</span>
              <span className="text-sm text-gray-600">
                {' '}· {g.received_on} · {METHODS.find((m) => m.id === g.method)?.label ?? g.method}
                {g.note ? ` · ${g.note}` : ''}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true); setError('');
                try { await removeGift(g.id); await load(month); await onChanged(); } catch (cause) { setError(message(cause)); }
                finally { setBusy(false); }
              }}
              className="tap-sm rounded-full px-4 text-sm font-bold text-red-700 ring-1 ring-red-300 disabled:opacity-50"
            >
              Take back
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
