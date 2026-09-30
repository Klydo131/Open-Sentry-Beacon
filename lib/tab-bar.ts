// The bar along the bottom of a phone or a pad: Menu, People, My Files.
//
// Asked for with a sketch and a screenshot of a messaging app's menu: "Can we
// have Menu | People | My Files as our bottom for our UI to make it simple in
// our Mobile and Pad?"
//
// Kept pure, with no React and no database, so the two questions that decide
// what the bar does can be tested in Node: where each tab goes for a given
// role, and which tab is lit on a given screen. Both shells (the sample one
// and the live one) and My Files, which runs outside either shell, draw the
// same bar from these.

import type { Role } from './types';

export type Tab = 'menu' | 'people' | 'files';

// Each role's own home. The same table as HOME in lib/live/session.tsx and in
// app/api/auth/sign-in/route.ts; tests/the-bottom-bar.mjs fails if they part.
// Copied rather than imported because session.tsx is a client module that
// brings the database client with it, and this file must stay importable on
// its own.
const HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

// PEOPLE IS EACH ROLE'S OWN HOME, OPENED ON ITS PEOPLE.
//
// Every role's home already leads with people: a Guide's opens on My Explorers,
// an Explorer's on My Guide, a Director's on Pairings. The subroom is named in
// the address because a home remembers the last subroom somebody chose, and a
// tab called People that opened on "Next 7 days" would be a tab that lies.
// A Director's Admin has no subroom named for people on the sample side, so it
// goes to the room and lets it open where it opens.
const PEOPLE_ROOM: Partial<Record<Role, string>> = {
  dm: 'people',
  ds: 'guide',
};

export const MENU_HREF = '/menu';
export const FILES_HREF = '/library';

export function homeOf(role: Role): string {
  return HOME[role];
}

export function peopleHref(role: Role): string {
  const room = PEOPLE_ROOM[role];
  return room ? `${HOME[role]}?room=${room}` : HOME[role];
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Which tab is lit on this screen.
 *
 * People: the role's home and everything inside it (one Explorer's page is
 * /dm/<pairing>), and /talk, which is a conversation with those same people.
 * My Files: /library. Menu: everything else, because everything else is a room
 * somebody reached from the Menu, the way a messaging app keeps Menu lit in
 * its settings.
 */
export function tabFor(path: string, role: Role): Tab {
  const clean = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  if (within(clean, FILES_HREF)) return 'files';
  if (within(clean, HOME[role]) || within(clean, '/talk')) return 'people';
  return 'menu';
}
