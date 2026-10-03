'use client';

// Puts the look chosen on this device onto the page, once it has loaded.
//
// The server always sends <html data-ui-theme="classic">, so Classic is there
// from the first paint and nothing moves for anybody who has not chosen
// otherwise. A look added later is applied here, after the first paint; if one
// ever needs to be there before it, that is a small script in the head, and
// the Content-Security-Policy in next.config.mjs has to allow it. See
// lib/ui-themes.ts.

import { useEffect, useState } from 'react';
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

/**
 * The look chosen on this device, kept up to date as it changes here or in
 * another tab. Classic until it has been read, which is what the server sent.
 * What a look draws of its own renders only when this says that look.
 */
export function useChosenLook(): string {
  const [look, setLook] = useState(CLASSIC);
  useEffect(() => {
    const read = () => setLook(readUiTheme());
    read();
    const fromStorage = (event: StorageEvent) => {
      if (event.key === UI_THEME_KEY) read();
    };
    window.addEventListener(UI_THEME_EVENT, read);
    window.addEventListener('storage', fromStorage);
    return () => {
      window.removeEventListener(UI_THEME_EVENT, read);
      window.removeEventListener('storage', fromStorage);
    };
  }, []);
  return look;
}
