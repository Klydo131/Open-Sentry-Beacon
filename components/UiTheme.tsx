'use client';

// Puts the look chosen on this device onto the page, once it has loaded.
//
// The server always sends <html data-ui-theme="classic">, so Classic is there
// from the first paint and nothing moves for anybody who has not chosen
// otherwise. A look added later is applied here, after the first paint; if one
// ever needs to be there before it, that is a small script in the head, and
// the Content-Security-Policy in next.config.mjs has to allow it. See
// lib/ui-themes.ts.

import { useEffect, useSyncExternalStore } from 'react';
import { applyUiTheme, CLASSIC, readUiTheme, UI_THEME_EVENT, UI_THEME_KEY } from '@/lib/ui-themes';

export function UiTheme() {
  useEffect(() => {
    applyUiTheme(readUiTheme());
    // Chosen in another tab of the same app: follow it here too.
    const follow = (event: StorageEvent) => {
      if (event.key === UI_THEME_KEY) applyUiTheme(readUiTheme());
    };
    window.addEventListener('storage', follow);
    return () => window.removeEventListener('storage', follow);
  }, []);
  return null;
}

function follow(onChange: () => void) {
  const fromStorage = (event: StorageEvent) => {
    if (event.key === UI_THEME_KEY) onChange();
  };
  window.addEventListener(UI_THEME_EVENT, onChange);
  window.addEventListener('storage', fromStorage);
  return () => {
    window.removeEventListener(UI_THEME_EVENT, onChange);
    window.removeEventListener('storage', fromStorage);
  };
}

/**
 * The look chosen on this device, kept up to date as it changes here or in
 * another tab. What a look draws of its own renders only when this says so.
 *
 * READ AT ONCE, NOT A MOMENT LATER. Desktop is the default on computers, so
 * its rooms are on most computer screens, and they are drawn from the bottom
 * bar, which every page mounts afresh. Read in an effect, they appeared a
 * frame after the page on every navigation. useSyncExternalStore reads this
 * device's choice on the first render of anything mounted after the page has
 * loaded (every shell waits for its person first), and uses Classic, what the
 * server sent, only while the server's HTML is being taken over.
 */
export function useChosenLook(): string {
  return useSyncExternalStore(follow, readUiTheme, () => CLASSIC);
}
