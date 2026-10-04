'use client';

// Listen: the media player, its playlists and the calming sounds, moved here
// from My Files on 4 October 2026 ("take out the audio tools from the library").
//
// THE FILES THEMSELVES DID NOT MOVE. Music somebody saved is still in their
// device library (lib/localMedia.ts), so My Files still lists it and still
// plays any one file with its own Play button; this room is where it is
// played as music, in order, with the full player. Music added here is saved
// to the same place, so it shows up in both.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { PlayerPanel } from '@/components/PlayerBar';
import { Playlists } from '@/components/Playlists';
import { listMedia, type MediaMeta } from '@/lib/localMedia';
import { saveFilesFromInput, savedMessage } from '@/lib/save-media';
import type { RoomTheme } from '@/lib/room-theme';

export function Listen({ theme }: { theme?: RoomTheme }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  const refresh = useCallback(() => listMedia().then(setItems).catch(() => {}), []);
  useEffect(() => {
    listMedia().then(setItems).catch(() => {}).finally(() => setReady(true));
  }, []);

  const onFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setBusy(true);
    const result = await saveFilesFromInput(event.target);
    setBusy(false);
    if (result.saved > 0) await refresh();
    setSaid(savedMessage(result));
  };

  return (
    <div className="space-y-5" data-music-listen>
      <PlayerPanel
        vault={items}
        theme={theme}
        onAddMedia={() => fileRef.current?.click()}
        onVaultChanged={() => void refresh()}
      />

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">Add music</h2>
        <p className="mt-1 text-sm text-gray-600">
          Songs, recordings of your choir, or videos. They are kept on this phone with your other files, and
          nothing is uploaded.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="audio/*,video/*"
          onChange={onFiles}
          className="hidden"
          tabIndex={-1}
          aria-hidden
        />
        <div className="mt-4">
          <Button variant="gold" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Saving…' : '⬆️ Add music from this phone'}
          </Button>
        </div>
        {said && <p role="status" className="mt-3 text-sm font-semibold text-navy">{said}</p>}
      </Card>

      {ready && items.some((item) => item.type === 'audio' || item.type === 'video') && (
        <Playlists items={items} onRefresh={refresh} />
      )}
    </div>
  );
}
