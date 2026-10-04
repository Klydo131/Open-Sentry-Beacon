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

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { useLocale, LANGUAGES } from '@/lib/i18n';
import { UI_FAMILIES, UI_THEMES, looksIn, saveUiTheme, type UiFamily, type UiTheme } from '@/lib/ui-themes';
import { ChevronGlyph } from '@/components/Glyph';
import { useChosenLook } from '@/components/UiTheme';

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

// TRY IT FIRST, THEN APPLY. The owner, 3 October 2026: "text size should be
// tested and see first before applying, there should be an apply button for
// text size". Pressing a size used to change the whole app at once, so the
// very screen somebody was reading jumped under their finger, and a size too
// big to find the next button on was already in force. Now a size only
// changes the preview, which is drawn at exactly the size it would be (the
// root is 18px times the scale, lib/i18n.tsx), and nothing else moves until
// Apply. Leaving the screen without pressing it changes nothing.
export function TextSizeCard() {
  const { t, scale, setScale } = useLocale();
  const [trying, setTrying] = useState(scale);
  const [justApplied, setJustApplied] = useState(false);
  // A size applied somewhere else (another tab) is what this card shows next.
  useEffect(() => {
    setTrying(scale);
  }, [scale]);

  const same = (a: number, b: number) => Math.abs(a - b) < 0.001;
  const nameOf = (value: number) => t(SIZES.find((s) => same(s.scale, value))?.key ?? 'normal');
  const changed = !same(trying, scale);

  return (
    <Card className="p-5" data-panel="text-size">
      <h2 className="mb-1 text-xl font-bold text-navy">🔠 {t('textSize')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        Make everything bigger or smaller. Try a size in the preview first, then press Apply.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SIZES.map((s) => {
          const picked = same(trying, s.scale);
          return (
            <button
              key={s.key}
              type="button"
              data-text-size={s.key}
              onClick={() => {
                setTrying(s.scale);
                setJustApplied(false);
              }}
              // The one being tried is said out loud as well as coloured,
              // because colour alone is not an answer for somebody who came
              // to this screen precisely because reading it is hard.
              aria-pressed={picked}
              className="tap rounded-xl px-3 font-semibold"
              style={picked ? { backgroundColor: '#1E2A4A', color: '#fff' } : { backgroundColor: '#EEF1F7', color: '#1E2A4A' }}
            >
              <span style={{ fontSize: `${0.9 + (s.scale - 0.9) * 1.2}rem` }}>A</span> {t(s.key)}
              {changed && same(scale, s.scale) && <span className="block text-xs font-normal opacity-70">In use</span>}
            </button>
          );
        })}
      </div>

      {/* Drawn at the size being tried, in pixels, whatever the app is at now. */}
      <div className="mt-5 rounded-xl bg-gray-50 p-4" data-text-size-preview>
        <p className="mb-1 text-sm text-gray-400">Preview: {nameOf(trying)}</p>
        <p className="font-semibold text-navy" style={{ fontSize: `${18 * trying * 1.125}px`, lineHeight: 1.35 }}>
          {t('appTagline')}
        </p>
        <p className="mt-1 text-gray-700" style={{ fontSize: `${18 * trying}px`, lineHeight: 1.5 }}>
          This is how your messages, lessons and notices will read.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-text-size-apply
          disabled={!changed}
          onClick={() => {
            setScale(trying);
            setJustApplied(true);
          }}
          className="tap rounded-xl px-6 font-bold disabled:cursor-not-allowed"
          style={changed ? { backgroundColor: '#1E2A4A', color: '#fff' } : { backgroundColor: '#EEF1F7', color: '#6B7280' }}
        >
          Apply
        </button>
        {changed && (
          <button
            type="button"
            data-text-size-keep
            onClick={() => setTrying(scale)}
            className="tap rounded-xl px-4 font-semibold text-navy underline"
          >
            Keep {nameOf(scale)}
          </button>
        )}
      </div>
      {/* Its own line: beside the buttons it was squeezed to a sliver on a phone. */}
      <p className="mt-2 text-sm text-gray-600" aria-live="polite" data-text-size-status>
        {changed
          ? `Showing ${nameOf(trying)} in the preview. Apply to use it everywhere.`
          : justApplied
            ? `${nameOf(scale)} is applied everywhere.`
            : `${nameOf(scale)} is in use.`}
      </p>
    </Card>
  );
}

// THE LOOK, 3 October 2026: "I want the current UI to be called "classic" in
// the settings right now, ChatGPT or Codex will introduce new theme UI that
// users can pick, but make sure the classic UI remains the same please."
//
// Classic is the app as it is, and on a computer that is the desktop design
// (rooms down the left, a light top bar), which was briefly a look of its own
// called Desktop until the owner: "this is the classic". How a look is added
// without touching Classic is in lib/ui-themes.ts.
export function LookCard() {
  // This device's choice, or the default (Classic) when nothing is chosen.
  const look = useChosenLook();
  return (
    // data-panel, not a data- attribute of its own: Card passes on only the
    // attributes it names (components/ui.tsx), and an unnamed one never reaches
    // the page.
    <Card className="p-5" data-panel="look-settings">
      <h2 className="mb-1 text-xl font-bold text-navy">🎨 Look</h2>
      <p className="mb-4 text-sm text-gray-500">
        How the app looks on this device. A family of looks opens to show them side by side, and Classic
        stays exactly as it is.
      </p>
      <div role="radiogroup" aria-label="Look" className="grid gap-2 sm:grid-cols-2">
        {UI_THEMES.filter((theme) => !theme.family).map((theme) => (
          <LookChoice key={theme.id} theme={theme} chosen={look === theme.id} />
        ))}
      </div>
      {UI_FAMILIES.map((family) => <LookFamily key={family.id} family={family} look={look} />)}
    </Card>
  );
}

/** One look to choose: its name, said in words when it is chosen, and what it is like. */
function LookChoice({ theme, chosen, picture = false }: { theme: UiTheme; chosen: boolean; picture?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      data-ui-theme-choice={theme.id}
      onClick={() => saveUiTheme(theme.id)}
      className="tap rounded-xl px-4 py-3 text-left"
      style={chosen ? { backgroundColor: '#1E2A4A', color: '#fff' } : { backgroundColor: '#EEF1F7', color: '#1E2A4A' }}
    >
      {picture && (
        // The look's own drawn art (public/themes/<id>.svg), so the difference
        // can be seen before choosing. Decoration: the name says which it is.
        // Not lazy: each is about 2 KB, and lazy meant they began loading only
        // as the drop-down opened, so they appeared a moment after it.
        <img
          src={`/themes/${theme.id}.svg`}
          alt=""
          aria-hidden
          width={600}
          height={320}
          className="mb-2 block h-24 w-full rounded-lg object-cover"
        />
      )}
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold">{theme.name}</span>
        {/* Said in words as well as coloured, as the text size is. */}
        {chosen && <span className="text-sm font-semibold">Chosen</span>}
      </span>
      <span className="mt-0.5 block text-sm" style={{ opacity: 0.85 }}>
        {theme.description}
      </span>
    </button>
  );
}

/**
 * A FAMILY OF LOOKS: one row that opens to show them, each with its picture
 * and what it is like. Asked for on 4 October 2026: "as sub file for 'look'
 * so people can see the difference ... with drop down on it (with
 * description)".
 *
 * Open by itself while one of its looks is chosen, until somebody opens or
 * closes it. Closed, its looks are still on the page, hidden, so anything that
 * reads every look Settings offers (tests/e2e/the-first-paint.js) finds them.
 */
function LookFamily({ family, look }: { family: UiFamily; look: string }) {
  const looks = looksIn(family.id);
  const chosen = looks.find((theme) => theme.id === look);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? !!chosen;
  const panel = `look-family-${family.id}`;
  return (
    <div className="mt-3" data-look-family={family.id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setToggled(!open)}
        className="tap flex w-full items-center gap-3 rounded-xl bg-slate-100 px-4 py-3 text-left text-navy"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-lg font-bold">{family.name}</span>
            <span className="text-sm font-semibold">{chosen ? `${chosen.name} chosen` : `${looks.length} looks`}</span>
          </span>
          <span className="mt-0.5 block text-sm" style={{ opacity: 0.85 }}>
            {family.description}
          </span>
        </span>
        <ChevronGlyph open={open} size={20} />
      </button>
      {/* The grid is inside, so `hidden` is not undone by a display class. */}
      <div id={panel} hidden={!open}>
        <div role="radiogroup" aria-label={`${family.name} looks`} className="mt-2 grid gap-2 sm:grid-cols-2">
          {looks.map((theme) => (
            <LookChoice key={theme.id} theme={theme} chosen={look === theme.id} picture />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The cards for how the app reads and looks here, in the order the demo has always shown the first two. */
export function ReadingSettings() {
  return (
    <>
      <LanguageCard />
      <TextSizeCard />
      <LookCard />
    </>
  );
}
