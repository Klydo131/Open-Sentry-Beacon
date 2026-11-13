// Emoji, suggested while you type, rather than hunted for in a grid.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS. Type a colon and a couple of letters -- `:pra` -- and the
// matches appear above the box. Pick one and it replaces what you typed. The
// same pattern people already know from every tool that has it, and the reason
// it was asked for as part of typing rather than as a button.
//
// WHY A COLON, AND NOT SUGGESTING ON ORDINARY WORDS. The obvious "smarter"
// version watches what somebody writes and offers an emoji for it -- type
// "pray" and be offered a folded-hands. That would be wrong HERE, and it is
// worth saying why rather than leaving it as a taste. This box is where
// somebody tells their Guide about an illness, a marriage in trouble, a
// bereavement. An app that pops a cheerful picture up beside those words has
// made a joke of them. A colon is a deliberate act: nothing is ever suggested
// to somebody who did not ask, in the middle of the hardest sentence they will
// write this year.
//
// EVERY ENTRY IS A REAL EMOJI, AND components/Glyph.tsx IS WHY. The sign-out
// button was once an empty box on every Android phone, because it used U+23FB
// from Miscellaneous Technical -- a character that LOOKS like an emoji and is
// not one, so no font promises to draw it. Emoji proper are safe: every phone
// ships a colour emoji font covering the set. So nothing from a symbol block
// gets in here, and the few characters that default to TEXT presentation carry
// an explicit U+FE0F variation selector to ask for the colour glyph. The test
// checks both, because tofu is invisible on the machine this was written on.
//
// THE LIST IS DELIBERATELY SMALL AND DELIBERATELY PLAIN. It is a church
// directory, not a keyboard: no drink, no gestures that are rude in the
// Philippines or anywhere else, nothing that could combine into a sentence
// somebody would be embarrassed to have read out. The same rule the invitation
// word list states in its own file. A phone keyboard still has every emoji
// there is for anybody who wants one -- this is a shortcut, not a gate.
// ---------------------------------------------------------------------------

export interface Emoji {
  /** The character itself, with a variation selector where one is needed. */
  readonly char: string;
  /** What somebody might type after the colon. First name is the label. */
  readonly names: readonly string[];
}

// EVERY ENTRY CARRIES U+FE0F, AND THAT IS A DELIBERATE OVER-APPLICATION.
//
// A variation selector asks for the colour glyph. Some characters need it --
// they default to a monochrome TEXT shape without one -- and some already
// default to colour, where it does nothing at all.
//
// The tempting rule is "add it only where it is needed", and the first version
// of this file used it: anything below U+1F000. That rule is WRONG, and wrong
// in the direction that does not show up on the machine it was written on. The
// dove U+1F54A and the rain cloud U+1F327 are both well above U+1F000 and both
// default to text presentation, so the tidy rule stripped the selector from
// exactly the two entries that could not do without it.
//
// Knowing which characters need it means carrying a copy of Unicode's
// Emoji_Presentation data, which is a dependency and a thing to keep current.
// Adding it everywhere is a no-op where it is not needed and correct where it
// is, and the rule is then simple enough to actually check: every entry ends
// with it. Cheap beats clever when the failure mode is invisible.
//
// AND ONE CANDIDATE WAS DROPPED
// rather than kept. The alarm clock U+23F0 is a perfectly real emoji -- and it
// lives in Miscellaneous Technical, the same block as the U+23FB that drew an
// empty box on every Android phone. The guardrail that catches that block is
// deliberately blunt, because the distinction is precisely the one nobody can
// see while writing the code on a machine that renders both. A clock is not
// worth teaching it an exception, so there is no clock; the calendar carries
// arranging a time.
export const EMOJI: readonly Emoji[] = [
  // The ones this app is actually for.
  { char: '🙏️', names: ['pray', 'praying', 'amen', 'please', 'thanks'] },
  { char: '❤️', names: ['heart', 'love'] },
  { char: '✝️', names: ['cross', 'faith'] },
  { char: '🕊️', names: ['dove', 'peace'] },
  { char: '⛪️', names: ['church', 'chapel'] },
  { char: '📖️', names: ['bible', 'book', 'read', 'scripture'] },
  { char: '🌱️', names: ['seedling', 'grow', 'growing', 'new'] },

  // Faces. Enough to be warm, not enough to be a sticker pack.
  { char: '🙂️', names: ['smile', 'happy'] },
  { char: '😊️', names: ['blush', 'glad'] },
  { char: '😂️', names: ['laugh', 'haha', 'funny'] },
  { char: '😢️', names: ['sad', 'cry', 'tears'] },
  { char: '😔️', names: ['sorry', 'downcast'] },
  { char: '🤗️', names: ['hug', 'hugs'] },
  { char: '😍️', names: ['lovely', 'adore'] },
  { char: '😴️', names: ['sleep', 'tired'] },
  { char: '🤔️', names: ['thinking', 'hmm'] },

  // Saying yes, saying hello, saying well done.
  { char: '👍️', names: ['yes', 'ok', 'thumbsup', 'good'] },
  { char: '👋️', names: ['hi', 'hello', 'wave', 'bye'] },
  { char: '🤝️', names: ['agree', 'handshake', 'deal'] },
  { char: '👏️', names: ['clap', 'welldone', 'bravo'] },
  { char: '✅️', names: ['done', 'check', 'tick', 'finished'] },
  { char: '🎉️', names: ['celebrate', 'party', 'congratulations'] },
  { char: '⭐️', names: ['star'] },
  { char: '💪️', names: ['strong', 'strength'] },

  // The practical half: arranging to meet, and the day around it.
  { char: '📅️', names: ['date', 'calendar', 'diary'] },
  { char: '📍️', names: ['place', 'where', 'location'] },
  { char: '📞️', names: ['call', 'phone', 'ring'] },
  { char: '💬️', names: ['talk', 'chat', 'message'] },
  { char: '🏠️', names: ['home', 'house'] },
  { char: '🚗️', names: ['car', 'drive', 'lift'] },
  { char: '☕️', names: ['coffee', 'tea', 'meet'] },
  { char: '🍞️', names: ['bread'] },
  { char: '🎵️', names: ['music', 'song', 'sing', 'hymn'] },

  // Weather, because half of arranging anything here is about the rain.
  { char: '☀️', names: ['sun', 'sunny'] },
  { char: '🌧️', names: ['rain', 'raining', 'wet'] },
  { char: '🌈️', names: ['rainbow', 'promise'] },
  { char: '🔥️', names: ['fire'] },
];

/** How many are offered at once. Enough to choose from, few enough to read. */
export const SUGGESTION_LIMIT = 6;

/**
 * The `:token` being typed immediately before the caret, or null.
 *
 * WHAT IT REFUSES, AND WHY EACH ONE MATTERS. A colon is a punctuation mark
 * people already type, so the trigger has to be narrow or it fires constantly
 * in the middle of ordinary writing:
 *
 *   `10:30`          a time. The colon follows a DIGIT, so it is not a trigger.
 *   `https://x`      a URL. Same rule: the colon follows a letter.
 *   `Luke 4:18`      a verse reference, and the single most likely false
 *                    positive in this particular app.
 *   `: `             a colon then a space. The token must be letters.
 *
 * So the colon has to start a word -- be at the start of the text or follow
 * whitespace -- and be followed by at least two letters. Two, not one, because
 * one letter matches most of the list and offers a menu to somebody who has not
 * said what they want yet.
 */
export function tokenAt(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const colon = upto.lastIndexOf(':');
  if (colon === -1) return null;

  // The colon must begin a word.
  const before = colon === 0 ? '' : upto[colon - 1];
  if (before !== '' && !/\s/.test(before)) return null;

  const query = upto.slice(colon + 1);
  // Letters only, so a space or punctuation ends it -- and it cannot run on to
  // the end of a paragraph looking for a match.
  if (!/^[a-z]{2,20}$/i.test(query)) return null;

  return { start: colon, query: query.toLowerCase() };
}

/**
 * The emoji worth offering for what has been typed so far.
 *
 * Ordered so that a name STARTING with the query comes before one that merely
 * contains it: typing `:pra` should put praying-hands first, not somewhere
 * below a word that happens to have "pra" in the middle.
 */
export function suggest(query: string): Emoji[] {
  if (!query) return [];
  const q = query.toLowerCase();

  const starts: Emoji[] = [];
  const contains: Emoji[] = [];
  for (const e of EMOJI) {
    if (e.names.some((n) => n.startsWith(q))) starts.push(e);
    else if (e.names.some((n) => n.includes(q))) contains.push(e);
  }
  return [...starts, ...contains].slice(0, SUGGESTION_LIMIT);
}

/**
 * The text after choosing `emoji` for the token at `start`.
 *
 * A TRAILING SPACE, because the alternative is worse than it looks. Without it
 * the caret sits flush against the emoji and the next word is typed onto it,
 * and on a phone the keyboard's own autocorrect then treats the pair as one
 * token and offers to "correct" it. One space and both problems are gone.
 *
 * BUT NOT A SECOND ONE. Choosing an emoji in the MIDDLE of a sentence --
 * `say :pra then go` -- already has a space after the token, so adding another
 * produced a double gap that nobody typed and everybody would see. The space
 * goes in only when there is not one there already, and the caret moves by the
 * amount actually inserted rather than by an assumed one.
 */
export function replaceToken(
  text: string, start: number, caret: number, emoji: string,
): { text: string; caret: number } {
  const after = text.slice(caret);
  const gap = /^\s/.test(after) ? '' : ' ';
  const next = `${text.slice(0, start)}${emoji}${gap}${after}`;
  return { text: next, caret: start + emoji.length + gap.length };
}
