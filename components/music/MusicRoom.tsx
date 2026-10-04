'use client';

// The Music room: for everybody who sings, plays, or only listens.
//
// Asked for on 4 October 2026: "another room for music for music lovers and
// choir. Put the main audio tools to it ... I want a tuner, a piece scanner,
// and beat maker (where you can track the beat like a conductor)." Four
// folders, one per job:
//
//   Listen     the media player, playlists and calming sounds, moved here
//              from My Files (which keeps a Play button on each file)
//   Tuner      which note you are singing or playing, and how far off
//   Conductor  a metronome that beats the pattern a conductor's hand draws
//   Pieces     a photo of a page made clean, and a score file played part by
//              part so a singer can learn theirs
//
// EVERYTHING HAPPENS ON THE PHONE. Nothing in this room talks to the church's
// database or to anybody else: the microphone is measured and thrown away, a
// photo is straightened on the phone, a score is read on the phone, and what
// is kept is kept on the phone. tests/the-music-room.mjs holds that line.
//
// ONE FOLDER AT A TIME, ON PURPOSE. Leaving the Tuner unmounts it, and that
// is what releases the microphone; leaving the Conductor stops its clicks.
// The hooks also stop themselves when the phone locks or the app goes to the
// background, so nothing here keeps listening or ticking in a pocket.

import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { Listen } from '@/components/music/Listen';
import { TunerPanel } from '@/components/music/TunerPanel';
import { ConductorPanel } from '@/components/music/ConductorPanel';
import { PiecesPanel } from '@/components/music/PiecesPanel';
import type { RoomTheme } from '@/lib/room-theme';

const ROOMS: Room[] = [
  { id: 'listen', label: '🎧 Listen' },
  { id: 'tuner', label: '🎯 Tuner' },
  { id: 'conductor', label: '🎼 Conductor' },
  { id: 'pieces', label: '📄 Pieces' },
];

export function MusicRoom({ theme }: { theme?: RoomTheme }) {
  const [room, choose] = useRoom(ROOMS, 'beacon:music-room');
  return (
    <div className="space-y-5" data-music-room>
      <div>
        <h1 className="text-3xl font-extrabold text-room">🎵 Music</h1>
        <p className="mt-1 text-room-soft">
          For the choir and for anybody who loves music. Everything here works on this phone, and nothing is sent anywhere.
        </p>
      </div>
      <RoomTabs rooms={ROOMS} room={room} onChoose={choose} />
      {room === 'listen' && <Listen theme={theme} />}
      {room === 'tuner' && <TunerPanel />}
      {room === 'conductor' && <ConductorPanel />}
      {room === 'pieces' && <PiecesPanel />}
    </div>
  );
}
