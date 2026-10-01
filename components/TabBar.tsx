'use client';

// Menu | People | My Files, along the bottom of every phone and pad.
//
// ---------------------------------------------------------------------------
// WHAT IT REPLACED. Below 1280px the only way around the app was a row of
// emoji along the top: Church, Office, Publish, Library, Cases, Mail, Settings,
// sliding sideways under a thumb, with a gradient to hint that more were hidden
// past the edge. It worked, and it asked somebody to recognise eight small
// pictures, remember which one was which, and know to push the row to find the
// rest. That is a lot to ask of a person opening a church app on an older phone.
//
// Asked for instead, with a sketch: "Can we have Menu | People | My Files as
// our bottom for our UI to make it simple in our Mobile and Pad?" Three words,
// always on screen, always in the same place, reachable by the thumb that is
// already holding the phone. Every room that was in the top row is in Menu, as
// a list with its name written out.
//
// WHERE EACH ONE GOES is decided in lib/tab-bar.ts, which has no React in it so
// it can be tested on its own: People is the role's own home opened on its
// people, My Files is /library, Menu is /menu.
//
// ON A DESKTOP TOO (30 September 2026): "Can we have the same dropdown and UI
// with Desktops please?" There was a left rail at 1280px and up, drawing the
// same rooms; it is gone, and this bar is the navigation at every width.
//
// NOT INSIDE A CONVERSATION. Asked for as "Hide the bar inside conversations
// too": a screen that IS a conversation marks itself `data-conversation-screen`,
// and globals.css hides the bar while one is on the page, as a messaging app
// does inside a chat. Since the chat moved into the bubble (30 September 2026)
// that is /talk alone; the bubble covers the bar on a phone and stands on it on
// a desktop.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Role } from '@/lib/types';
import { FILES_HREF, MENU_HREF, peopleHref, tabFor, type Tab } from '@/lib/tab-bar';
import { FolderGlyph, MenuGlyph, PeopleGlyph } from '@/components/Glyph';

// Before the first paint on the client, so a page never draws one frame with
// its last line under the bar. The plain effect is only there for the server
// render, where there is nothing to measure.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const TABS: { key: Tab; label: string; Icon: typeof MenuGlyph }[] = [
  { key: 'menu', label: 'Menu', Icon: MenuGlyph },
  { key: 'people', label: 'People', Icon: PeopleGlyph },
  { key: 'files', label: 'My Files', Icon: FolderGlyph },
];

export function TabBar({ role }: { role: Role }) {
  const path = usePathname() || '/';
  const lit = tabFor(path, role);
  const ref = useRef<HTMLElement | null>(null);

  // PUBLISHED, NOT GUESSED. The bar is fixed, so the page does not know it is
  // there, and its height is not a constant: the phone's home-indicator inset
  // is added to it, and on a pad the icon and the word sit side by side. So it
  // measures itself and writes `--tab-bar`, the same way the install bar
  // writes `--install-bar`, and globals.css spends it in the three places that
  // need it: the page's bottom padding, where a scrolled-to control comes to
  // rest, and `.safe-bottom`, which lifts every floating thing (the chat
  // bubble, the install bar, the feedback nudge, the update toast) above it.
  //
  // Hidden inside a conversation, the element measures 0 and the variable is
  // removed, so the conversation gets the room back.
  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty('--tab-bar', `${h}px`);
      else root.style.removeProperty('--tab-bar');
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--tab-bar');
    };
  }, []);

  const hrefOf = (key: Tab) =>
    key === 'menu' ? MENU_HREF : key === 'files' ? FILES_HREF : peopleHref(role);

  return (
    <nav
      ref={ref}
      aria-label="Main"
      className="tab-bar no-print fixed inset-x-0 bottom-0 z-30"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {TABS.map(({ key, label, Icon }) => {
          const href = hrefOf(key);
          const on = lit === key;
          // `page` only when this IS the screen the tab opens; `true` when the
          // tab is lit because the screen is somewhere inside it (a room
          // reached from Menu, one Explorer inside People). A screen reader
          // hears the difference; everybody sees the same lit tab.
          const here = on && path === href.split('?')[0];
          return (
            <li key={key} className="min-w-0">
              <Link
                href={href}
                data-quest={`tab-${key}`}
                aria-current={on ? (here ? 'page' : 'true') : undefined}
                className="tab-bar-tab"
              >
                <span className="tab-bar-pill" aria-hidden>
                  <Icon size={24} />
                </span>
                <span className="tab-bar-label">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
