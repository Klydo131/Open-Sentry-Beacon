// What the search box in the header can find (components/AppSearch.tsx).
//
// Asked for on 12 November 2026. So it finds rooms, every Settings card,
// every look by name, and every help answer word for word. It is built from
// the app's own text, held in the browser, and sends nothing anywhere: no
// member's data is in it, and nothing typed leaves the device.

import { UI_THEMES } from '@/lib/ui-themes';
import { faqSections } from '@/lib/faq';

export interface Findable {
  /** What the result says. */
  title: string;
  /** Where it is, in words: "Settings, General". */
  where: string;
  href: string;
  /** Other words people use for it, and any text it holds. */
  words: string;
}

const ROOMS: Findable[] = [
  { title: 'Home', where: 'Room', href: '/church', words: 'church announcements blog notices updates mission news start' },
  { title: 'My Explorers', where: 'Room', href: '/dm', words: 'guide people pairing walk with explorers' },
  { title: 'My Journey', where: 'Room', href: '/ds', words: 'explorer progress steps journey' },
  { title: 'Talk', where: 'Room', href: '/talk', words: 'chat message conversation voice reply react' },
  { title: 'Office', where: 'Room', href: '/office', words: 'office work desk' },
  { title: 'Sabbath program', where: 'Office', href: '/office?room=sabbath', words: 'order of service sabbath program bulletin hymn sermon print word picture share' },
  { title: 'Evangelistic meetings', where: 'Office', href: '/office?room=evangelism', words: 'evangelism series nights campaign flyer meetings' },
  { title: 'Lesson studies', where: 'Office', href: '/office?room=studies', words: 'lessons bible study series' },
  { title: 'Resources', where: 'Office', href: '/office?room=library', words: 'library links share resource send take back' },
  { title: 'Reports', where: 'Office', href: '/office?room=reports', words: 'progress report print' },
  { title: 'Numbers', where: 'Office', href: '/office?room=numbers', words: 'analytics statistics how the church is going' },
  { title: 'This Sabbath', where: 'Room', href: '/sabbath', words: 'shared program order of service this week' },
  { title: 'Study Room', where: 'Room', href: '/study', words: 'notes whiteboard documents study board draw' },
  { title: 'Music', where: 'Room', href: '/music', words: 'tuner sing note playlist songs hymns pitch' },
  { title: 'My Files', where: 'Room', href: '/library', words: 'files library resources documents' },
  { title: 'Appointments', where: 'My Explorers or My Journey', href: '/dm', words: 'meeting appointment schedule time place calendar change call off' },
  { title: 'Profile', where: 'Room', href: '/profile', words: 'my name photo account picture' },
  { title: 'Mail', where: 'Room', href: '/mail', words: 'email inbox messages' },
  { title: 'Admin', where: 'Room', href: '/admin', words: 'approve members invitations people leaders director' },
  { title: 'Admin Reports', where: 'Room', href: '/cases', words: 'report safety concern' },
  { title: 'Password', where: 'Account', href: '/password', words: 'change password sign in security' },
];

const SETTINGS: Findable[] = [
  { title: 'Language', where: 'Settings, General', href: '/settings?room=general', words: 'language translate english tagalog filipino' },
  { title: 'Text size', where: 'Settings, General', href: '/settings?room=general', words: 'text size bigger larger font read zoom' },
  { title: 'Look', where: 'Settings, General', href: '/settings?room=general', words: 'look theme colours design dark appearance style' },
  { title: 'Install the app', where: 'Settings, General', href: '/settings?room=install', words: 'install home screen app download' },
  { title: 'Notifications', where: 'Settings, General', href: '/settings?room=general', words: 'notifications alerts bell push sound' },
  { title: 'App version', where: 'Settings, General', href: '/settings?room=general', words: 'version update refresh online' },
  { title: 'Feedback you sent', where: 'Settings, General', href: '/settings?room=general', words: 'feedback suggestion bug report' },
  { title: 'Church name', where: 'Settings, Church', href: '/settings?room=church', words: 'church name rename' },
  { title: 'Legal details', where: 'Settings, Church', href: '/settings?room=church', words: 'legal registration address privacy officer' },
  { title: 'Tutorial', where: 'Settings, Help', href: '/settings?room=tutorial', words: 'tutorial practice sample demo learn quest' },
  { title: 'Help and questions', where: 'Settings, Help', href: '/faq', words: 'help faq questions how do i' },
  { title: 'Full width page', where: 'Your office or room, on a computer', href: '/church', words: 'full width full screen hide desk right side tuck away' },
];

/** Every look, by its name, so "Old Classic" or "Aero" finds the Look card. */
const LOOKS: Findable[] = UI_THEMES.map((t) => ({
  title: `${t.name} look`,
  where: 'Settings, General, Look',
  href: '/settings?room=general',
  words: `${t.description} theme`,
}));

let cached: Findable[] | null = null;

/** The whole index: rooms, Settings, looks, and every help answer. */
export function findables(): Findable[] {
  if (cached) return cached;
  const help: Findable[] = faqSections().flatMap((s) => s.items.map((item) => ({
    title: item.q,
    where: `Help, ${s.title}`,
    href: `/faq#faq-${item.id}`,
    words: item.a.join(' '),
  })));
  cached = [...ROOMS, ...SETTINGS, ...LOOKS, ...help];
  return cached;
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/**
 * What matches every word typed, best first: a title that starts with it,
 * then a title that holds it, then the words and text around it.
 */
export function search(q: string, limit = 8): Findable[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { f: Findable; score: number }[] = [];
  for (const f of findables()) {
    const title = fold(f.title);
    const all = `${title} ${fold(f.where)} ${fold(f.words)}`;
    if (!words.every((w) => all.includes(w))) continue;
    const phrase = words.join(' ');
    const score = (title.startsWith(phrase) ? 4 : 0) + (title.includes(phrase) ? 2 : 0)
      + words.filter((w) => title.includes(w)).length;
    scored.push({ f, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.f);
}
