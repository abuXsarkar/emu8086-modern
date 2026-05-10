// Word lists for room codes. Curated by hand to avoid:
//   - profanity, slurs, and politically loaded terms in any major
//     language used by the target audience (English + the 10 South
//     Asian locales the IDE ships translations for);
//   - homophones and visually-confusable spellings (e.g. "moose" and
//     "mouse" — kept "moose" only);
//   - words that lean adult or violent (e.g. "shark" stayed because
//     it's neutral animal; "viper" was cut as too aggressive for a
//     classroom artifact);
//   - colors that are hard to dictate over voice ("scarlet" vs
//     "crimson") — kept only well-known shades.
//
// 36 colors × 60 animals × 90 numbers = 194,400 codes, comfortably
// more than enough for thousands of concurrent rooms with a low
// collision rate.

import { randomInt } from "node:crypto";

export const COLORS: readonly string[] = [
  "amber",
  "azure",
  "beige",
  "blue",
  "brown",
  "copper",
  "coral",
  "crimson",
  "cyan",
  "emerald",
  "gold",
  "green",
  "indigo",
  "ivory",
  "jade",
  "lemon",
  "lime",
  "magenta",
  "maroon",
  "mint",
  "navy",
  "olive",
  "orange",
  "peach",
  "pearl",
  "pink",
  "plum",
  "purple",
  "red",
  "rose",
  "sage",
  "silver",
  "slate",
  "teal",
  "violet",
  "yellow",
];

export const ANIMALS: readonly string[] = [
  "ant",
  "badger",
  "bat",
  "bear",
  "bee",
  "bird",
  "bison",
  "butterfly",
  "camel",
  "cat",
  "cheetah",
  "cow",
  "crab",
  "crane",
  "deer",
  "dog",
  "dolphin",
  "dove",
  "duck",
  "eagle",
  "elephant",
  "falcon",
  "ferret",
  "finch",
  "fox",
  "frog",
  "goat",
  "hawk",
  "heron",
  "horse",
  "ibex",
  "jaguar",
  "koala",
  "lion",
  "llama",
  "lynx",
  "moose",
  "octopus",
  "otter",
  "owl",
  "panda",
  "parrot",
  "peacock",
  "penguin",
  "pony",
  "puffin",
  "quail",
  "rabbit",
  "raven",
  "robin",
  "seal",
  "sheep",
  "sparrow",
  "squirrel",
  "stork",
  "swan",
  "tiger",
  "turtle",
  "whale",
  "wolf",
];

/**
 * Compose a friendly room code: `<color>-<animal>-<NN>`, e.g.
 * `blue-fox-42`. Numbers stay two-digit (10–99) so dictation over
 * voice never has to worry about leading zeroes or hundreds.
 *
 * The caller passes a `taken` predicate so the generator can retry
 * on collision against the active room registry. After
 * `maxAttempts` failures we throw — that effectively means the
 * server is at saturation, which is operationally interesting on
 * its own and shouldn't be silently papered over.
 */
export function generateRoomCode(
  taken: (code: string) => boolean,
  maxAttempts = 32,
): string {
  for (let i = 0; i < maxAttempts; i++) {
    const c = COLORS[randomInt(0, COLORS.length)];
    const a = ANIMALS[randomInt(0, ANIMALS.length)];
    const n = randomInt(10, 100);
    const code = `${c}-${a}-${n}`;
    if (!taken(code)) return code;
  }
  throw new Error(
    `could not generate a non-colliding room code after ${maxAttempts} attempts`,
  );
}

/**
 * Quick structural validator — used by the server to reject crafted
 * room IDs in `join` messages without doing a full registry lookup.
 * Doesn't check word-list membership: that would force a 96-entry
 * lookup on every join. Lookup against the live registry covers it.
 */
export function isPlausibleRoomCode(s: unknown): s is string {
  if (typeof s !== "string") return false;
  // <slug>-<slug>-<2 digits>; slugs are lowercase a-z only.
  return /^[a-z]{2,16}-[a-z]{2,16}-[1-9][0-9]$/.test(s);
}
