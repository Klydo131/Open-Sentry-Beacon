'use client';

// THE LANGUAGE, BEFORE ANYBODY HAS SIGNED IN.
//
// Settings, General, Language has offered sixteen languages for a long time,
// and it is behind the sign-in. Somebody who reads Cebuano or Arabic first met
// the app as an English front door and an English sign-in form, which are the
// two screens they most need to understand. So the same choice sits on both,
// small, in the corner where a phone puts it. It writes the same setting as
// Settings does (lib/i18n.tsx), so the app keeps the language after sign-in.

import { LANGUAGES, useLocale } from '@/lib/i18n';

export function LanguagePick({ className = '' }: { className?: string }) {
  const { t, lang, setLang } = useLocale();
  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className="text-base">🌐</span>
      <select
        id="language-pick"
        value={lang}
        onChange={(event) => setLang(event.target.value)}
        aria-label={t('language')}
        data-language-pick
        // The options are drawn by the phone on a light sheet, so they carry
        // their own dark ink rather than the white of the dark header.
        className="tap-sm max-w-[9rem] rounded-full bg-white/10 px-3 text-sm font-semibold text-white outline-none ring-1 ring-white/25 focus:ring-2 focus:ring-gold [&_option]:text-gray-900"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
