'use client';

// LANGUAGE AND TEXT SIZE, IN ONE PLACE THAT BOTH SETTINGS PAGES DRAW.
//
// REPORTED WITH A SCREENSHOT OF THE LIVE SETTINGS PAGE: "Open Hope Beacon is
// missing the general settings that the Local Church has, like make the letters
// big or small or general settings at all. Can we add the please for ALL users."
//
// Every part of it was already built. lib/i18n.tsx has held the scale, the
// localStorage key, the effect that applies it to the root font size, and the
// words `textSize`, `small`, `normal`, `large` and `xlarge` translated into all
// sixteen languages, for as long as the file has existed. LocaleProvider is
// mounted in app/layout.tsx, so it was running on every page of the live app the
// whole time.
//
// What was missing was the screen. app/settings/page.tsx -- the DEMO settings,
// the one inside the tutorial -- had a folder called "Language and size".
// components/LiveAccountPages.tsx, which is the settings page every real person
// actually opens, had five folders and none of them was that one. It did not
// even import useLocale. So the app could make its text bigger for anybody who
// was pretending, and not for anybody who was using it.
//
// That is the same shape of defect as the deaf Office room and the blank
// Pairing-requests tab: built in every layer except the one that shows it. The
// reason it keeps happening is that the demo and the live app are two separate
// renderings of the same product, and nothing compared them. So this is one
// component that both pages render, rather than two copies that agree today.
//
// WHY IT MATTERS MORE THAN IT LOOKS. This is a church app. A good share of the
// congregation is reading a 375px phone in a dim hall, and 18px is not enough
// for them. Text size is the difference between using the app and asking
// somebody else to read it out.

import { Card } from '@/components/ui';
import { useLocale, LANGUAGES } from '@/lib/i18n';

// The same four steps the demo has always offered. 0.9 to 1.3 against an 18px
// base is 16px to 23px -- a real change for somebody who needs it, and still
// laid out rather than zoomed, because the root font size is what every `rem`
// in the app is measured against.
export const SIZES: { key: 'small' | 'normal' | 'large' | 'xlarge'; scale: number }[] = [
  { key: 'small', scale: 0.9 },
  { key: 'normal', scale: 1 },
  { key: 'large', scale: 1.15 },
  { key: 'xlarge', scale: 1.3 },
];

export function LanguageCard() {
  const { t, lang, setLang } = useLocale();
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🌐 {t('language')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        Choose your language. More of the app is translated over time; anything
        not translated yet stays in English.
      </p>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="tap w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
        aria-label={t('language')}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native} · {l.name}
          </option>
        ))}
      </select>
    </Card>
  );
}

export function TextSizeCard() {
  const { t, scale, setScale } = useLocale();
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🔠 {t('textSize')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        Make everything bigger or smaller. Changes apply right away.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SIZES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScale(s.scale)}
            // The chosen one is said out loud as well as coloured, because
            // colour alone is not an answer for somebody who came to this
            // screen precisely because reading it is hard.
            aria-pressed={Math.abs(scale - s.scale) < 0.001}
            className="tap rounded-xl px-3 font-semibold"
            style={
              Math.abs(scale - s.scale) < 0.001
                ? { backgroundColor: '#1E2A4A', color: '#fff' }
                : { backgroundColor: '#EEF1F7', color: '#1E2A4A' }
            }
          >
            <span style={{ fontSize: `${0.9 + (s.scale - 0.9) * 1.2}rem` }}>A</span>{' '}
            {t(s.key)}
          </button>
        ))}
      </div>

      {/* Something to read at the new size without leaving the screen, so the
          choice can be judged rather than guessed at. */}
      <div className="mt-5 rounded-xl bg-gray-50 p-4">
        <p className="mb-1 text-sm text-gray-400">Preview</p>
        <p className="text-lg text-navy">{t('appTagline')}</p>
      </div>
    </Card>
  );
}

/** Both cards, in the order the demo has always shown them. */
export function ReadingSettings() {
  return (
    <>
      <LanguageCard />
      <TextSizeCard />
    </>
  );
}
