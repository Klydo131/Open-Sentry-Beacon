// Saying it your own way in a conversation: emoji you can pick, stickers,
// a message sent with an effect, and a look for your side of the chat.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 14 NOVEMBER 2026: the chat read as plain beside the apps young
// adults already use, and people wanted to express themselves in it.
//
// EVERYTHING HERE IS OURS AND STAYS ON OUR SIDE. No sticker or GIF service is
// called: those send what somebody searched for to another company, and what
// comes back is not chosen with children in mind. The stickers are words and
// emoji drawn by the app; the emoji are the ones every phone already has.
//
// A STICKER IS A MESSAGE WHOSE WORDS SAY WHAT IT IS. It travels as ordinary
// text, "[sticker: Praying for you]", so a notification, a report copied for
// safeguarding, a search and an older copy of the app all show something a
// person can read. Only a known label is drawn as a sticker.
//
// THE EMOJI LIST IS PLAIN ON PURPOSE, by the same rule as lib/live/emoji.ts:
// no drink, no gesture that is rude somewhere, nothing from a symbol block
// that an Android phone draws as an empty box. A phone's own keyboard still
// has every emoji there is.
//
// A LOOK IS YOURS ALONE. The colour and background somebody chooses are kept
// on their device, under their own id, and change only what they see.
// ---------------------------------------------------------------------------

import { CELEBRATIONS, type CelebrationKind } from '@/lib/celebrate';

// ---- Emoji to pick ----------------------------------------------------------

export interface EmojiGroup {
  readonly key: string;
  readonly label: string;
  readonly emoji: readonly string[];
}

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    key: 'faces', label: 'Faces',
    emoji: ['😀', '😊', '🙂', '😄', '😁', '😂', '🤣', '😅', '😇', '🥰', '😍', '🤗', '🤩', '😎', '🥳', '🤔', '😮', '🥹', '😢', '😭', '😴', '😌', '😬', '🙃'],
  },
  {
    key: 'hearts', label: 'Hearts and hands',
    emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '💖', '🫶', '🙏', '🙌', '👏', '👍', '👋', '🤝', '💪', '✌️', '🤞'],
  },
  {
    key: 'faith', label: 'Faith and study',
    emoji: ['📖', '✝️', '🕊️', '⛪', '🕯️', '🎵', '🎶', '🌅', '☀️', '🌙', '⭐', '✨', '🌈', '🔥', '💡', '✏️', '📝', '🎓'],
  },
  {
    key: 'life', label: 'Life',
    emoji: ['🎉', '🎂', '🎁', '🌸', '🌻', '🌿', '🍎', '🍞', '🥗', '🏠', '🚶', '⚽', '🎸', '📷', '💯', '✅', '🗓️', '👀'],
  },
];

// ---- Stickers ---------------------------------------------------------------

export interface Sticker {
  /** Never changes: it is what the message's words carry. */
  readonly label: string;
  readonly emoji: string;
  /** How it moves, where movement is welcome (app/globals.css .sticker-*). */
  readonly motion: 'bounce' | 'wiggle' | 'pulse' | 'float';
  /** Ground and ink, chosen together so the words always read. */
  readonly ground: string;
  readonly ink: string;
}

export const STICKERS: readonly Sticker[] = [
  { label: 'Praying for you', emoji: '🙏', motion: 'pulse', ground: '#e6f0ff', ink: '#173a7a' },
  { label: 'Amen!', emoji: '🙌', motion: 'bounce', ground: '#fff3d6', ink: '#6b4300' },
  { label: 'Happy Sabbath', emoji: '🌅', motion: 'float', ground: '#ffe9dc', ink: '#7a2e0e' },
  { label: 'Thank you', emoji: '💛', motion: 'pulse', ground: '#fff6cc', ink: '#5c4a00' },
  { label: 'Well done!', emoji: '🎉', motion: 'bounce', ground: '#e8f7e4', ink: '#1d5a23' },
  { label: 'You can do it', emoji: '💪', motion: 'wiggle', ground: '#e3f4f4', ink: '#0d4f57' },
  { label: 'Thinking of you', emoji: '🫶', motion: 'pulse', ground: '#fde8ef', ink: '#7a1238' },
  { label: 'Good morning', emoji: '☀️', motion: 'float', ground: '#fff1c9', ink: '#6b4300' },
  { label: 'Good night', emoji: '🌙', motion: 'float', ground: '#e7e6fb', ink: '#2d2a7a' },
  { label: 'Let\'s study', emoji: '📖', motion: 'wiggle', ground: '#e6f0ff', ink: '#173a7a' },
  { label: 'God bless you', emoji: '🕊️', motion: 'float', ground: '#eaf6fb', ink: '#0f4a66' },
  { label: 'See you soon', emoji: '👋', motion: 'wiggle', ground: '#f0ebff', ink: '#44238f' },
];

const STICKER_BODY = /^\[sticker: ([^\]\n]{1,40})\]$/;

/** The words a sticker travels as. */
export function stickerBody(sticker: Sticker): string {
  return `[sticker: ${sticker.label}]`;
}

/** The sticker a message is, or undefined when it is ordinary words. */
export function stickerOf(body: string): Sticker | undefined {
  const label = STICKER_BODY.exec(body.trim())?.[1];
  return label ? STICKERS.find((s) => s.label === label) : undefined;
}

/** What to say about a message in one line: a sticker by its name. */
export function plainSnippet(body: string): string {
  const sticker = stickerOf(body);
  return sticker ? `${sticker.emoji} ${sticker.label} (sticker)` : body;
}

// ---- Effects ----------------------------------------------------------------

/** What a message can be sent with. The same kinds the app celebrates with. */
export const EFFECTS = CELEBRATIONS;
export type MessageEffect = CelebrationKind;

export const EFFECT_LABEL: Record<MessageEffect, { label: string; emoji: string }> = {
  confetti: { label: 'Confetti', emoji: '🎊' },
  stars: { label: 'Stars', emoji: '⭐' },
  balloons: { label: 'Balloons', emoji: '🎈' },
  fireworks: { label: 'Fireworks', emoji: '🎆' },
  hearts: { label: 'Hearts', emoji: '💛' },
};

export function isEffect(value: unknown): value is MessageEffect {
  return typeof value === 'string' && (EFFECTS as readonly string[]).includes(value);
}

// ---- A look for your side of the chat ---------------------------------------

export interface BubbleColour {
  readonly key: string;
  readonly label: string;
  /** Empty for the app's own colour: nothing is set, so Classic is untouched. */
  readonly ground: string;
  readonly ink: string;
}

/** Every ground carries white words at 4.5:1 or better (tests hold it). */
export const BUBBLE_COLOURS: readonly BubbleColour[] = [
  { key: 'standard', label: 'Standard', ground: '', ink: '' },
  { key: 'teal', label: 'Teal', ground: '#0f766e', ink: '#ffffff' },
  { key: 'violet', label: 'Violet', ground: '#6d28d9', ink: '#ffffff' },
  { key: 'rose', label: 'Rose', ground: '#be123c', ink: '#ffffff' },
  { key: 'forest', label: 'Forest', ground: '#166534', ink: '#ffffff' },
  { key: 'clay', label: 'Clay', ground: '#9a3412', ink: '#ffffff' },
  { key: 'slate', label: 'Slate', ground: '#334155', ink: '#ffffff' },
];

export interface Wallpaper {
  readonly key: string;
  readonly label: string;
  /** A CSS class in app/globals.css; empty for the app's own ground. */
  readonly className: string;
}

export const WALLPAPERS: readonly Wallpaper[] = [
  { key: 'standard', label: 'Standard', className: '' },
  { key: 'dawn', label: 'Dawn', className: 'chat-paper-dawn' },
  { key: 'sky', label: 'Sky', className: 'chat-paper-sky' },
  { key: 'meadow', label: 'Meadow', className: 'chat-paper-meadow' },
  { key: 'dots', label: 'Dots', className: 'chat-paper-dots' },
  { key: 'lines', label: 'Lines', className: 'chat-paper-lines' },
];

export interface ChatLook {
  colour: string;
  paper: string;
}

export const STANDARD_LOOK: ChatLook = { colour: 'standard', paper: 'standard' };

/** Only keys that exist; anything else is the standard look. */
export function tidyLook(raw: unknown): ChatLook {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    colour: BUBBLE_COLOURS.some((c) => c.key === r.colour) ? String(r.colour) : 'standard',
    paper: WALLPAPERS.some((w) => w.key === r.paper) ? String(r.paper) : 'standard',
  };
}

/** Where one person's look is kept on this device. Ids only, never a name. */
export function lookKey(me: string): string {
  return `hb-chat-look:${me.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)}`;
}

export function readLook(storage: Pick<Storage, 'getItem'> | undefined, me: string): ChatLook {
  try {
    const raw = storage?.getItem(lookKey(me));
    return raw ? tidyLook(JSON.parse(raw)) : STANDARD_LOOK;
  } catch {
    return STANDARD_LOOK;
  }
}

export function writeLook(storage: Pick<Storage, 'setItem'> | undefined, me: string, look: ChatLook): void {
  try {
    storage?.setItem(lookKey(me), JSON.stringify(tidyLook(look)));
  } catch {
    /* A private window refuses; the look lasts for this sitting. */
  }
}
