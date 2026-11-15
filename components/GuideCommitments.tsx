'use client';

// The Guide commitments card. Simple to do, serious in intent: six plain
// commitments, a tick for each, and the Guide's own full name as signature.
// Until signed it sits at the top of the Guide's desk and does not go away;
// once signed it shrinks to one line with the date it must be renewed.

import { useState } from 'react';
import { COMMITMENTS, COMMITMENTS_TERM_DAYS, commitmentsCurrent, sameName } from '@/lib/guide-commitments';

export function GuideCommitments({ fullName, signedAt, onSign }: {
  fullName: string;
  signedAt: string | null;
  onSign: (typedName: string) => Promise<void>;
}) {
  const [ticked, setTicked] = useState<boolean[]>(() => COMMITMENTS.map(() => false));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const current = commitmentsCurrent(signedAt);

  if (current && !reading) {
    const renew = new Date(new Date(signedAt!).getTime() + COMMITMENTS_TERM_DAYS * 86_400_000);
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200" data-commitments="signed">
        <span aria-hidden>🛡️</span>
        <span className="min-w-0 flex-1"><strong>Guide commitments signed</strong> on {new Date(signedAt!).toLocaleDateString([], { dateStyle: 'medium' })}. Renew by {renew.toLocaleDateString([], { dateStyle: 'medium' })}.</span>
        <button type="button" className="tap-sm rounded-full px-3 font-bold underline" onClick={() => setReading(true)}>Read them again</button>
      </div>
    );
  }

  const all = ticked.every(Boolean);
  const named = sameName(name, fullName);
  const sign = async () => {
    setBusy(true); setError('');
    try { await onSign(name); setReading(false); } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'That could not be saved. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-2 ring-navy sm:p-5" aria-labelledby="commitments-title" data-commitments={current ? 'reading' : 'unsigned'}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-lg text-white">🛡️</span>
        <div className="min-w-0">
          <h2 id="commitments-title" className="text-lg font-extrabold text-navy">{current ? 'Your Guide commitments' : 'Before you walk with anyone: your commitments'}</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            You may be trusted with someone young or going through a hard time. These six promises keep them safe, and keep you safe too.
            {!current && ' Read each one, tick it, and sign with your full name.'}
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-2">
        {COMMITMENTS.map((c, i) => (
          <li key={c.title}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition ${ticked[i] || current ? 'bg-slate-50 ring-navy/30' : 'ring-slate-200 hover:bg-slate-50'}`}>
              {!current && (
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#1E2A4A]" checked={ticked[i]}
                  onChange={(e) => setTicked((t) => t.map((v, k) => (k === i ? e.target.checked : v)))} data-commitment={i} />
              )}
              <span className="min-w-0 text-sm">
                <span className="font-bold text-navy">{i + 1}. {c.title}</span>
                <span className="block text-slate-600">{c.detail}</span>
              </span>
            </label>
          </li>
        ))}
      </ol>

      {current ? (
        <button type="button" className="tap-sm mt-3 rounded-full px-4 text-sm font-bold text-navy ring-1 ring-slate-300" onClick={() => setReading(false)}>Close</button>
      ) : (
        <div className="mt-4 space-y-2">
          <label className="block text-sm font-bold text-navy" htmlFor="commitments-name">Sign with your full name</label>
          <input id="commitments-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
            placeholder={fullName} className="tap w-full rounded-xl bg-slate-50 px-4 text-base ring-1 ring-slate-300" data-commitments-name />
          <p className="text-xs text-slate-500">Type it exactly as it appears on your profile: {fullName}.</p>
          {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
          <button type="button" disabled={!all || !named || busy} onClick={() => void sign()}
            className="tap w-full rounded-xl bg-navy px-5 text-base font-extrabold text-white disabled:opacity-40 sm:w-auto" data-commitments-sign>
            {busy ? 'Signing…' : 'I commit to all six'}
          </button>
          {!all && <p className="text-xs text-slate-500">Tick all six to sign.</p>}
        </div>
      )}
    </section>
  );
}
