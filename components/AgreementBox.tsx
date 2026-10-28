'use client';

// The box that agrees to the Terms of Use and the Privacy Notice.
//
// ---------------------------------------------------------------------------
// ONE BOX, EVERY PLACE THAT ASKS: the invitation form on both halves of the
// app, and the agreement step a signed-in member meets when they have not
// agreed to the documents now in force (lib/legal.ts says why each rule below
// is there).
//
//   * BOTH DOCUMENTS ARE LINKS, opening in a new tab so the form keeps what
//     was typed. A link inside a label does not tick the box when tapped.
//   * UNTICKED UNTIL THE PERSON TICKS IT; the form's button waits for it.
//   * THE VERSION AND DATE ARE SAID under the box, so what was agreed to can
//     be pointed at later.
//   * IT IS NOT THE PERMISSION TO KEEP SENSITIVE INFORMATION. That is its own
//     box with its own words (components/live/ConsentWording.tsx), beside this
//     one, as the Data Privacy Act asks.
// ---------------------------------------------------------------------------

import { LEGAL_EFFECTIVE, legalHref } from '@/lib/legal';

export function AgreementBox({ checked, onChange, churchId, className = '' }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The church being joined, so the documents can name it. */
  churchId?: string | null;
  className?: string;
}) {
  const link = 'font-semibold text-navy underline underline-offset-2';
  return (
    <label className={`flex items-start gap-3 rounded-xl bg-navy/5 p-4 ${className}`} data-agreement>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0"
        aria-describedby="agreement-version"
        data-agreement-box
      />
      <span className="text-sm leading-relaxed text-gray-700">
        I have read and agree to the{' '}
        <a href={legalHref('terms', churchId)} target="_blank" rel="noopener" className={link} data-agreement-terms>
          Terms of Use<span className="sr-only"> (opens in a new tab)</span>
        </a>{' '}
        and the{' '}
        <a href={legalHref('privacy', churchId)} target="_blank" rel="noopener" className={link} data-agreement-privacy>
          Privacy Notice<span className="sr-only"> (opens in a new tab)</span>
        </a>
        .{' '}<span className="text-red-600" aria-hidden>*</span>
        <span id="agreement-version" className="mt-1 block text-xs text-gray-500">
          Both as of {LEGAL_EFFECTIVE}. You will be asked again if either changes.
        </span>
      </span>
    </label>
  );
}
