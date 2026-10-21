// The court room's avatars: a game-like figure for each person in a hearing.
//
// ASKED FOR on 20 October 2026: "I want the UI to be some kind of a game
// avatar for live session court."
//
// WHAT AN AVATAR IS MADE FROM. Only the person's account id, worked through a
// small hash into a skin tone, a hair style and colour, a shirt colour and
// whether they wear glasses. Nothing is stored, no photo is used, and the same
// person looks the same on every device and in every case. What they wear on
// top of that is their part in the case: the judge's robe, the presenter's
// jacket. An account that has been deleted is a plain grey figure.

export type AvatarPart = 'judge' | 'opener' | 'accused' | 'reporter' | 'witness' | 'observer';

export interface AvatarLook {
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3 | 4;
  shirt: string;
  glasses: boolean;
}

const SKIN = ['#f6d3b8', '#ebb995', '#d39a6c', '#b27a4d', '#8a5634', '#5e3a22'];
const HAIR = ['#24170f', '#3f2716', '#6b4123', '#a8723a', '#d6b16b', '#141414', '#8d8d8d'];
const SHIRT = ['#2f6db3', '#2f8f6b', '#b54a4a', '#7a4fb3', '#c77a26', '#2b8a99', '#9b3d6e', '#4f7a2a'];

/** FNV-1a: small, fast, the same everywhere. Not for anything secret. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function lookFor(id: string): AvatarLook {
  const h = hash(id || 'nobody');
  return {
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 3) % HAIR.length],
    hairStyle: ((h >>> 7) % 5) as AvatarLook['hairStyle'],
    shirt: SHIRT[(h >>> 11) % SHIRT.length],
    glasses: ((h >>> 15) % 5) === 0,
  };
}

/** The words for a part, as the room says them. */
export const PART_WORDS: Record<AvatarPart, string> = {
  judge: 'the judge',
  opener: 'brought the case',
  accused: 'the case is about them',
  reporter: 'raised it',
  witness: 'witness',
  observer: 'watching',
};
