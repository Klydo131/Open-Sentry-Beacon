// A first password somebody can read off a phone screen and type in.
//
// WHY THE INVITATION CARRIES A PASSWORD AT ALL.
//
// Every demo so far has been damaged by the same thing: the invitation carried
// a ONE-TIME LINK, and a one-time link is fragile in ways nobody invited to a
// church app should have to understand. It expires. It is spent by the first
// thing that opens it, which on many mail systems is a scanner and not a
// person. It works once, so a second tap fails. Twenty-three people were once
// stuck at the same moment, each holding an account with no password and a
// link that had already been used.
//
// A password does not expire, is not consumed by being read, and survives being
// forwarded, re-opened, or tapped twice. The person can also read it out loud
// to somebody helping them, which is how an older member actually gets set up.
//
// WHAT THIS COSTS, SAID PLAINLY. A password sitting in an inbox is weaker than
// a link that dies in an hour: anybody who can read that mailbox can sign in,
// and it stays true until the password is changed. That is the trade, it was
// made deliberately, and the answer to it is the wording in the email and the
// nudge inside the app -- not pretending the trade is not there.
//
// THE SHAPE, AND WHY IT IS THIS SHAPE.
//
//   harbor4821        acorn48213
//
// ONE WORD AND SOME DIGITS, EXACTLY TEN CHARACTERS. Asked for directly: "Please
// dont make the passwords be too long, just make a word with numbers in a 10
// letter password." The previous shape was three hyphenated words and three
// digits -- twenty-two characters -- which is stronger and is genuinely worse
// to be handed. It wraps in a mail client, it is a long way to look between
// reading and typing, and every hyphen is a character somebody leaves out.
//
//   * ALL LOWERCASE. Every capital is a shift key on a phone, and a shift key
//     is a place to get it wrong. Nothing here needs the extra alphabet.
//   * A REAL WORD FIRST. `xK7#pQ2v` cannot be read aloud, cannot be remembered
//     for the ten seconds between the email and the sign-in box, and cannot be
//     dictated over the phone to somebody who is stuck.
//   * NO HYPHEN NOW. At ten characters a separator costs a tenth of the whole
//     password to buy nothing: `harbor4821` has an obvious seam already.
//   * DIGITS FILL THE REST, so the total is always exactly ten -- the app's own
//     minimum, in lib/live/data.ts. Longer words get fewer digits.
//   * NO AMBIGUOUS WORDS. Nothing that sounds like something else when read
//     out (`their`, `there`), nothing anybody has to think about spelling.
//
// WHAT IT COSTS, STATED PLAINLY RATHER THAN BURIED. Three words and a number
// was about 34 bits; one word and a number is about 23, which is roughly eight
// million possibilities instead of fifteen billion. That is a real reduction
// and it was asked for knowingly. What makes it defensible is what the
// credential IS: temporary, on a rate-limited online sign-in, for an account
// that also has to be approved before it can do anything, with the e-mail and
// the app both asking the person to change it. It is not a secret meant to
// survive somebody running guesses offline, and it never was.

/**
 * The words. Short, ordinary, unmistakable when spoken.
 *
 * ADD WORDS FREELY; the picker below is correct at any list size. It did not
 * used to be. This file first shipped with 272 words and a picker that drew ONE
 * random byte, and one byte cannot address 272 things: the rejection ceiling
 * computed to zero and `firstPassword()` LOOPED FOREVER. Not a weak password --
 * no password, and an edge function that never answers. Caught by running it
 * rather than by reading it, which is the only reason it is not in this commit.
 *
 * The comment here used to say "keep this list a power of two", which is a rule
 * the code did not enforce and nobody would have noticed breaking. The picker
 * enforces itself now.
 *
 * Nothing here should be able to combine into a sentence that would embarrass
 * somebody reading it out in church. That is why there are no verbs, no body
 * parts, and no adjectives that attach to a person.
 */
export const WORDS: readonly string[] = [
  'acorn', 'amber', 'anchor', 'apple', 'april', 'arbor', 'arch', 'arrow',
  'aspen', 'atlas', 'autumn', 'axis', 'bakery', 'balcony', 'bamboo', 'banjo',
  'barley', 'basil', 'basket', 'beacon', 'bell', 'birch', 'bison', 'bloom',
  'blossom', 'boat', 'bonfire', 'border', 'bottle', 'boulder', 'branch', 'brass',
  'bread', 'breeze', 'bridge', 'bronze', 'brook', 'bucket', 'bundle', 'burrow',
  'button', 'cabin', 'cable', 'cactus', 'camera', 'candle', 'canoe', 'canvas',
  'canyon', 'cargo', 'carpet', 'castle', 'cedar', 'cellar', 'cement', 'chapel',
  'cherry', 'circle', 'citrus', 'clay', 'cliff', 'clock', 'cloud', 'clover',
  'coast', 'cobalt', 'cocoa', 'coffee', 'column', 'comet', 'compass', 'copper',
  'coral', 'cotton', 'crane', 'crater', 'crayon', 'cricket', 'crystal', 'cushion',
  'daisy', 'dawn', 'delta', 'denim', 'desert', 'diamond', 'domino', 'donut',
  'dove', 'dragon', 'drum', 'dune', 'eagle', 'east', 'ember', 'emerald',
  'engine', 'fabric', 'falcon', 'feather', 'fern', 'ferry', 'fiddle', 'field',
  'filter', 'finch', 'flame', 'flannel', 'flint', 'flute', 'forest', 'fountain',
  'fox', 'frost', 'galaxy', 'garden', 'garnet', 'gate', 'gecko', 'ginger',
  'glacier', 'glass', 'globe', 'granite', 'grape', 'gravel', 'grove', 'guitar',
  'gull', 'hammer', 'harbor', 'harvest', 'hazel', 'heron', 'hickory', 'honey',
  'horizon', 'igloo', 'indigo', 'ink', 'iris', 'island', 'ivory', 'jacket',
  'jade', 'jasmine', 'jetty', 'jigsaw', 'journal', 'juniper', 'kayak', 'kettle',
  'kitchen', 'kite', 'lagoon', 'lake', 'lantern', 'lattice', 'lavender', 'ledger',
  'lemon', 'lentil', 'lilac', 'linen', 'lobby', 'locket', 'lotus', 'lumber',
  'magnet', 'mango', 'maple', 'marble', 'meadow', 'melon', 'mesa', 'metro',
  'mint', 'mirror', 'mitten', 'monsoon', 'moss', 'mountain', 'museum', 'mustard',
  'nectar', 'needle', 'nest', 'nickel', 'north', 'nutmeg', 'oasis', 'oatmeal',
  'ocean', 'olive', 'onyx', 'opal', 'orbit', 'orchard', 'orchid', 'otter',
  'oxide', 'oyster', 'paddle', 'palm', 'pantry', 'paper', 'parcel', 'parsley',
  'pasture', 'pebble', 'pelican', 'pepper', 'petal', 'pewter', 'piano', 'pigment',
  'pillow', 'pilot', 'pine', 'planet', 'plateau', 'plum', 'pocket', 'pond',
  'poplar', 'poppy', 'porch', 'postcard', 'pottery', 'prairie', 'pretzel', 'puffin',
  'pumpkin', 'quarry', 'quartz', 'quilt', 'quince', 'rabbit', 'radish', 'rafter',
  'rainbow', 'ranch', 'raven', 'reef', 'ribbon', 'river', 'robin', 'rocket',
  'rope', 'rosemary', 'saffron', 'sage', 'salmon', 'sandal', 'satin', 'scarf',
];

/** The whole password, every time. The app's own minimum, met exactly. */
const TOTAL = 10;

/**
 * Which words may be drawn.
 *
 * Five and six letters only, so what follows is four or five digits. Shorter
 * words would leave six digits to remember, which is the part people get wrong;
 * longer ones leave three, which is where the guessing space gets thin.
 */
const USABLE = WORDS.filter((w) => w.length === 5 || w.length === 6);

/** How many numbers can follow a word: first digit 1-9, the rest 0-9. */
function numbersAfter(word: string): number {
  return 9 * (10 ** (TOTAL - word.length - 1));
}

/** Every password this can make, counted over the real branches. */
function allPasswords(): number {
  let combinations = 0;
  for (const word of USABLE) combinations += numbersAfter(word);
  return combinations;
}

/**
 * How hard this is to guess, in bits, worked out rather than asserted.
 *
 * One word from the list, then enough digits to make ten characters. The test
 * prints this and fails if it drops, so shrinking the word list can never
 * quietly weaken every invitation the church sends.
 *
 * About 23 bits. That is a TEMPORARY credential on a rate-limited online
 * sign-in, not a secret meant to stand up to somebody with the password file
 * and a month. The email says to change it and the app asks again; this number
 * is the floor under the few days in between.
 *
 * TRUE ONLY BECAUSE EVERY PASSWORD IS EQUALLY LIKELY (see firstPassword). A
 * count of possibilities is the strength of a password only when each of them
 * is as likely as the rest; until 28 September 2026 they were not, and this
 * number said 23.0 while the likeliest passwords were about 20.6.
 */
export function entropyBits(): number {
  // Summed over the real branches rather than assumed uniform: a five-letter
  // word leaves five digits and a six-letter word leaves four, and those are
  // very different sizes. Counting them separately is the only way this number
  // stays true when the word list changes.
  return Math.log2(allPasswords());
}


/**
 * A whole number below `limit`, drawn evenly.
 *
 * WHY NOT `randomBytes[0] % WORDS.length`. A remainder maps the 256 possible
 * byte values onto the list unevenly whenever the list size does not divide
 * 256, so the first few words come up more often than the rest. Rejecting the
 * draws that would skew it is exact at every size.
 *
 * AND WHY THE DRAW SIZES ITSELF. The first version always drew one byte, which
 * silently required `limit` to be 256 or less -- above that the ceiling
 * computes to zero, nothing is ever accepted, and the loop never ends. Taking
 * two bytes when one cannot reach the limit removes that cliff, so the word
 * list can grow to 65536 without anybody having to know this existed.
 */
function below(limit: number): number {
  if (limit < 1) throw new Error('below() needs a positive limit');
  if (limit > 2 ** 32) throw new Error('below() draws at most four bytes');
  // One byte, two, or four: whichever is the smallest that can reach the limit.
  // Four is for the whole-password draw below, which is about eight million.
  const size = limit > 65536 ? 4 : limit > 256 ? 2 : 1;
  const range = 2 ** (8 * size);
  const ceiling = Math.floor(range / limit) * limit;   // largest exact multiple
  const bytes = new Uint8Array(size);
  for (;;) {
    crypto.getRandomValues(bytes);
    // Multiplied rather than shifted: `<< 24` on a byte over 127 goes negative.
    let draw = 0;
    for (const b of bytes) draw = draw * 256 + b;
    if (draw < ceiling) return draw % limit;
  }
}

/**
 * The password at a given place in the list of every password, in order: the
 * first word with its smallest number, through to the last word with its
 * largest. Exported so the test can check the ends of every word's run without
 * drawing millions of passwords to find them.
 */
export function passwordAt(index: number): string {
  let rest = index;
  for (const word of USABLE) {
    const count = numbersAfter(word);
    if (rest < count) {
      // The smallest number with this many digits, plus how far along we are:
      // 1000..9999 after a six-letter word, 10000..99999 after a five-letter one.
      return `${word}${10 ** (TOTAL - word.length - 1) + rest}`;
    }
    rest -= count;
  }
  throw new Error('passwordAt() was given a place past the last password');
}

/**
 * A first password: one word and a number, exactly ten characters.
 *
 * Example shape: `harbor4821`
 *
 * ONE DRAW OVER EVERY PASSWORD, NOT A WORD AND THEN A NUMBER. It used to pick
 * the word first, evenly, and then the digits. That made a six-letter word
 * (9,000 numbers after it) exactly as likely as a five-letter one (90,000), so
 * each password after a six-letter word was TEN TIMES as likely as the rest:
 * somebody guessing those first needed about 20.6 bits of luck, not the 23
 * entropyBits() reported. Found on 28 September 2026 because the test that
 * counts repeats failed on one runner -- it expected about half a repeat in
 * three thousand passwords and the real rate was about one and a half.
 *
 * Every password is now one place in a single list and each place is equally
 * likely, so the 23 bits are true. The number still never starts with a zero
 * (`047` gets typed as `47`), because the list only holds numbers that do not.
 */
export function firstPassword(): string {
  return passwordAt(below(allPasswords()));
}

