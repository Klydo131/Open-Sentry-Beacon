'use client';

import { minorState, type MinorState } from '@/lib/minor';

// "MINOR", next to the name of anybody under 18.
//
// WHO SEES THIS, AND WHY IT IS NOT EVERYBODY. The badge goes where a Guide or a
// Director sees the person they are responsible for. It is deliberately NOT put
// anywhere one Explorer can see another, because a list that marks which users
// are children is a safeguarding problem of its own, not a safeguarding
// control. In this app that is mostly structural already — conversations are
// one Guide to one Explorer, and an Explorer reading a guild roll gets an empty
// list — but it is a rule to keep rather than a coincidence to rely on.
//
// The two states are drawn differently on purpose. A minor with consent on file
// is a fact to be aware of. A minor with NO consent recorded is something
// somebody has to do, and it should not look the same as the settled case.

export function MinorBadge({
  person,
  className = '',
}: {
  person: { birthday?: string | null; guardian_name?: string | null; guardian_consent_at?: string | null };
  className?: string;
}) {
  const state: MinorState = minorState(person);
  if (state === 'none') return null;

  const missing = state === 'missing';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        missing
          ? 'bg-red-100 text-red-800 ring-1 ring-red-300'
          : 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
      } ${className}`}
      title={
        missing
          ? 'Under 18, and no signed parental consent has been recorded yet. A Director needs to see the letter.'
          : `Under 18. A Director has recorded signed consent${
              person.guardian_name ? ` from ${person.guardian_name}` : ''
            }.`
      }
    >
      <span aria-hidden>{missing ? '⚠️' : '🧒'}</span>
      {missing ? 'MINOR · consent missing' : 'MINOR'}
    </span>
  );
}
