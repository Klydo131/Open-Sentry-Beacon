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
// A password is not consumed by being read, survives being forwarded,
// re-opened, or tapped twice, and lasts three days rather than an hour. The
// person can also read it out loud to somebody helping them, which is how an
// older member actually gets set up.
//
// WHAT THIS COSTS, SAID PLAINLY. A password sitting in an inbox is weaker than
// a link that dies in an hour: anybody who can read that mailbox can sign in
// until the person chooses their own password or the three days run out. Since
// 29 September 2026 the database ends it and signs out every device that used
// it (supabase/migrations/20260929100000_an_invitation_password_runs_out.sql),
// after seven days at first and three since 3 October 2026
// (20261003130000_an_invitation_password_lasts_three_days.sql). That is the
// trade, it was made deliberately, and the answer to it is the short life, the
// wording in the email and the nudge inside the app -- not pretending the
// trade is not there.
//
// THE SHAPE, AND WHY IT IS THIS SHAPE.
//
//   harbor-acorn-river-48
//
// THREE DIFFERENT WORDS AND A TWO-DIGIT NUMBER, JOINED BY DASHES. Chosen by the
// owner on 3 October 2026, after that day's security audit found that the
// shape before it was too easy to guess:
//
//   * 28 September to 3 October: ONE WORD AND DIGITS, TEN CHARACTERS
//     (`harbor4821`), asked for as "a word with numbers in a 10 letter
//     password". About 8 million possibilities, 23 bits. It was accepted
//     because sign-in is rate-limited, but that limit counts attempts per
//     internet address, and addresses are cheap to rent; and the app signs in
//     through its own server, so the limit counted the server's addresses, not
//     the guesser's.
//   * Now: about 1.5 billion possibilities, 30.5 bits, roughly 180 times
//     harder to guess, for three days instead of seven.
//
//   * ALL LOWERCASE. Every capital is a shift key on a phone, and a shift key
//     is a place to get it wrong. Nothing here needs the extra alphabet.
//   * REAL WORDS. `xK7#pQ2v` cannot be read aloud, cannot be remembered for
//     the ten seconds between the email and the sign-in box, and cannot be
//     dictated over the phone to somebody who is stuck.
//   * DASHES BETWEEN, because three words run together cannot be read
//     (`harboracornriver48`). The e-mail says "joined by dashes" in words.
//   * THREE DIFFERENT WORDS, so nobody thinks `river-river-lamp` is a typo.
//   * TWO DIGITS, 10 TO 99. A number never starts with a zero, because `07`
//     gets typed as `7`.
//   * NO AMBIGUOUS WORDS. Nothing that sounds like something else when read
//     out (`their`, `there`), nothing anybody has to think about spelling.
//
// WHAT IT STILL IS. A temporary credential on an online sign-in, with the
// e-mail and the app both asking the person to change it. It is not a secret
// meant to survive somebody running guesses offline, and it never was.

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

/** Three different words, then the number. */
const WORDS_IN_A_PASSWORD = 3;

/** The number after them: 10 to 99, so it never starts with a zero. */
const FIRST_NUMBER = 10;
const NUMBERS = 90;

/** Every password this can make: three different words in order, then a number. */
function allPasswords(): number {
  let combinations = NUMBERS;
  for (let i = 0; i < WORDS_IN_A_PASSWORD; i++) combinations *= WORDS.length - i;
  return combinations;
}

/**
 * How hard this is to guess, in bits, worked out rather than asserted.
 *
 * Three different words from the list, then a number from 10 to 99. The test
 * prints this and fails if it drops, so shrinking the word list can never
 * quietly weaken every invitation the church sends.
 *
 * About 30.5 bits at 256 words. TRUE ONLY BECAUSE EVERY PASSWORD IS EQUALLY
 * LIKELY (see firstPassword): a count of possibilities is the strength of a
 * password only when each of them is as likely as the rest. Until 28 September
 * 2026 they were not.
 */
export function entropyBits(): number {
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
  if (limit > 2 ** 48) throw new Error('below() draws at most six bytes');
  // The fewest bytes that can reach the limit. The whole-password draw below
  // is about a billion and a half, so it takes four; a longer word list may
  // take five or six, which a JavaScript number still holds exactly.
  let size = 1;
  while (2 ** (8 * size) < limit) size += 1;
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
 * first three words with the smallest number, through to the last three with
 * the largest. Exported so the test can check both ends of the list without
 * drawing a billion passwords to find them.
 *
 * The place is read like the digits of a number whose last digit is the
 * number in the password (90 of them) and whose earlier digits pick each word
 * from the words not yet used (256, then 255, then 254).
 */
export function passwordAt(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= allPasswords()) {
    throw new Error('passwordAt() was given a place past the last password');
  }
  const number = FIRST_NUMBER + (index % NUMBERS);
  let rest = Math.floor(index / NUMBERS);
  // The word digits, last first, then put back in order.
  const places: number[] = [];
  for (let i = WORDS_IN_A_PASSWORD - 1; i >= 0; i--) {
    const choices = WORDS.length - i;
    places.unshift(rest % choices);
    rest = Math.floor(rest / choices);
  }
  const left = [...WORDS];
  const words = places.map((place) => left.splice(place, 1)[0]);
  return `${words.join('-')}-${number}`;
}

/**
 * A first password: three different words and a number, joined by dashes.
 *
 * Example shape: `harbor-acorn-river-48`
 *
 * ONE DRAW OVER EVERY PASSWORD, NOT A WORD AND THEN A NUMBER. The one-word
 * shape before this picked the word first, evenly, and then the digits, which
 * made some passwords ten times as likely as the rest (found on 28 September
 * 2026). Every password is one place in a single list here, and each place is
 * equally likely, so the bits entropyBits() reports are true.
 */
export function firstPassword(): string {
  return passwordAt(below(allPasswords()));
}
