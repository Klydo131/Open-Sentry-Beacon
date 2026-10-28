'use client';

// The church named in the Terms of Use and the Privacy Notice.
//
// The Data Privacy Act expects a privacy notice to say who holds the
// information and who its Data Protection Officer is. Those are the church's,
// not this project's, and they are a person's name and address, so they are
// not written into the public source: the church's Director fills them in
// (Settings, Church), and this reads them.
//
// WHERE FROM, in order: the sample church on the sample side; on the live side
// the church named in the link (`?church=`, which the invitation form and the
// agreement step add, so a person reads their own church's details before
// they have an account), else the signed-in person's own church. Nothing
// found, and the documents say plainly that the church has not filled them in.

import { useCallback, useEffect, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { useIsLive } from '@/lib/tutorial';
import * as live from '@/lib/live/data';
import { useKeepUp, KEEP_UP_ACCOUNT } from '@/lib/live/keep-up';
import { humanError } from '@/lib/live/errors';
import { legalComplete, type ChurchLegal, type ChurchLegalDetails, type ChurchLegalInput } from '@/lib/legal';

export function useChurchLegal(): { church: ChurchLegal | null; loading: boolean } {
  const isLive = useIsLive();
  const { db } = useDemo();
  const [church, setChurch] = useState<ChurchLegal | null>(null);
  const [loading, setLoading] = useState(isLive);

  const load = useCallback(async () => {
    // The tutorial reads the sample church below; only the live app asks.
    if (!isLive) return;
    try {
      const named = new URLSearchParams(window.location.search).get('church');
      if (named && /^[0-9a-f-]{36}$/i.test(named)) {
        const found = await live.churchPrivacyContact(named).catch(() => null);
        if (found) { setChurch(found); return; }
      }
      const mine = await live.myChurch().catch(() => null);
      if (mine) setChurch({ name: mine.name, legal_name: mine.legal_name, legal_address: mine.legal_address, dpo_name: mine.dpo_name, dpo_email: mine.dpo_email });
    } finally {
      setLoading(false);
    }
  }, [isLive]);
  useEffect(() => { void load(); }, [load]);
  // A document left open names what the Director saved a moment ago.
  useKeepUp(KEEP_UP_ACCOUNT, load);

  if (!isLive) {
    const legal = db.church_legal;
    return {
      church: {
        name: db.church_name,
        legal_name: legal?.legal_name || null,
        legal_address: legal?.legal_address || null,
        dpo_name: legal?.dpo_name || null,
        dpo_email: legal?.dpo_email || null,
      },
      loading: false,
    };
  }
  return { church, loading };
}

/** "Who holds your information", in a sentence, with the honest fallback. */
export function ChurchLegalLine({ church, loading }: { church: ChurchLegal | null; loading: boolean }) {
  if (loading) return <span className="text-gray-500">Looking up your church…</span>;
  if (church && legalComplete(church)) {
    return (
      <span data-church-legal="complete">
        <strong>{church.legal_name}</strong>
        {church.legal_name !== church.name && <> ({church.name})</>}, of {church.legal_address},
        provides this app to you and is responsible for what is kept in it. Its Data Protection
        Officer is <strong>{church.dpo_name}</strong>, at{' '}
        <a href={`mailto:${church.dpo_email}`} className="font-semibold text-navy underline">{church.dpo_email}</a>.
      </span>
    );
  }
  return (
    <span data-church-legal="missing">
      {church?.name ? <strong>{church.name}</strong> : 'Your church'} provides this app to you and
      is responsible for what is kept in it. It has not yet filled in its legal name, its
      address and its Data Protection Officer here; until it does, ask your church&rsquo;s
      Director, who can add them under Settings.
    </span>
  );
}

// The database's limits (20261028120000_what_was_agreed_is_recorded).
const MAX_LENGTH: Record<keyof ChurchLegalInput, number> = { legal_name: 200, legal_address: 300, dpo_name: 120, dpo_email: 200 };

/**
 * Where a church's Director fills in what the documents name: its legal name
 * and address, and its Data Protection Officer. The same form on both halves
 * of the app; each half saves it its own way.
 */
export function ChurchLegalForm({ initial, onSave }: {
  initial: Partial<ChurchLegalDetails>;
  onSave: (next: ChurchLegalInput) => Promise<void> | void;
}) {
  const [form, setForm] = useState<ChurchLegalInput>({
    legal_name: initial.legal_name ?? '',
    legal_address: initial.legal_address ?? '',
    dpo_name: initial.dpo_name ?? '',
    dpo_email: initial.dpo_email ?? '',
  });
  const [state, setState] = useState<'' | 'saving' | 'saved' | string>('');
  const field = (key: keyof typeof form, label: string, help: string, type = 'text') => (
    <label className="block">
      <span className="block text-sm font-semibold text-navy">{label}</span>
      <span className="block text-xs text-gray-500">{help}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setState(''); }}
        maxLength={MAX_LENGTH[key]}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
        data-church-legal-field={key}
      />
    </label>
  );
  return (
    <div className="space-y-3" data-church-legal-form>
      {field('legal_name', 'Legal name', 'As the church is registered, for example with the SEC.')}
      {field('legal_address', 'Registered address', 'Where the church is registered, as on its papers.')}
      {field('dpo_name', 'Data Protection Officer', 'The person who answers privacy questions and requests.')}
      {field('dpo_email', 'Their email', 'Where privacy questions and requests go.', 'email')}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={state === 'saving'}
          onClick={async () => {
            setState('saving');
            try { await onSave(form); setState('saved'); } catch (cause) { setState(humanError(cause, 'That did not save. Check your connection and try again.')); }
          }}
          className="tap rounded-xl bg-gold px-5 font-bold text-navy disabled:opacity-60"
          data-church-legal-save
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' && <p className="font-semibold text-green-600">✓ Saved. The Terms of Use and Privacy Notice now name them.</p>}
        {state && state !== 'saving' && state !== 'saved' && <p className="text-sm text-red-700">{state}</p>}
      </div>
    </div>
  );
}
