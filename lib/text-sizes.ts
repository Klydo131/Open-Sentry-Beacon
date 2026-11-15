// The four text sizes, shared by Settings (components/ReadingSettings.tsx) and
// the room drawer (components/RoomRails.tsx). Kept here, apart from either
// screen, so the drawer on every page does not carry the whole Settings card.
//
// 0.9 to 1.3 against an 18px base is 16px to 23px -- a real change for somebody
// who needs it, and still laid out rather than zoomed, because the root font
// size is what every `rem` in the app is measured against.
export const SIZES: { key: 'small' | 'normal' | 'large' | 'xlarge'; scale: number }[] = [
  { key: 'small', scale: 0.9 },
  { key: 'normal', scale: 1 },
  { key: 'large', scale: 1.15 },
  { key: 'xlarge', scale: 1.3 },
];
