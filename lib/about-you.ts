// The two questions with a fixed set of answers.
//
// WHY THEY BECAME LISTS. Gender and Status were open text boxes, and six people
// had answered before this changed: `Female`, `male`, `M` for one, and
// `Married`, `S` for the other. Five different shapes from six people, which is
// what an open box gets you — and it makes the answers useless for anything
// except reading one at a time, because "M" and "male" and "Male" do not group.
//
// KEEPING WHAT SOMEBODY ALREADY WROTE IS THE HARD PART, and skipping it is how
// this kind of change quietly destroys data: render a `select` whose value is
// `M`, and the browser shows the FIRST option instead, so the next time that
// person saves anything at all their answer silently becomes "Male" — or blank.
// They were never asked and never told. `optionsFor` therefore carries any
// existing answer into the list, so it stays selected and stays theirs until
// they choose to change it.
//
// STATUS IS RELATIONSHIP STATUS, not the journey stage. A Guide's screen shows
// a "Status" of Exploring or Connect, which is where somebody has reached — a
// different thing with the same name, decided by the church rather than by the
// member. Keep them apart when adding to either list.

export const GENDER_OPTIONS = ['Male', 'Female'] as const;

// Ordinary relationship status, in the order people usually pick from. "It's
// complicated" is on the list because the alternative for somebody in that
// position is to leave it blank or to lie, and neither helps a Guide.
export const LIFE_STATUS_OPTIONS = [
  'Single',
  'In a relationship',
  'Engaged',
  'Married',
  'Separated',
  'Divorced',
  'Widowed',
  "It's complicated",
  'Prefer not to say',
] as const;

/**
 * The list to show, with whatever this person already answered kept in it.
 *
 * Matching is case-insensitive and ignores surrounding space, so `male` selects
 * `Male` rather than being added again as a duplicate. Anything genuinely
 * unrecognised — `M`, `S` — is added at the end and marked, so the person can
 * see it is theirs and replace it deliberately.
 */
export function optionsFor(
  options: readonly string[],
  current: string | null | undefined,
): string[] {
  const value = (current ?? '').trim();
  if (!value) return [...options];
  const known = options.some((o) => o.toLowerCase() === value.toLowerCase());
  return known ? [...options] : [...options, value];
}

/** The option that should be selected, normalised to the list's own spelling. */
export function selectedValue(
  options: readonly string[],
  current: string | null | undefined,
): string {
  const value = (current ?? '').trim();
  if (!value) return '';
  return options.find((o) => o.toLowerCase() === value.toLowerCase()) ?? value;
}
