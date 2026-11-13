// What `git status` says has changed, parsed.
//
// ITS OWN MODULE SO IT CAN BE TESTED. Living inside ship.mjs it could not be:
// importing that script runs it, prints a usage message and exits. A helper
// that cannot be tested is exactly where a bug like the one below survives.

/**
 * The paths `git status` reports, parsed.
 *
 * SPLIT OUT AND EXPORTED SO IT CAN BE TESTED, because the inline version had a
 * bug that only ever damaged the FIRST file in the list and therefore survived
 * two successful ships before biting.
 *
 * `git status --porcelain` emits `XY<space>path`, and the status letters are
 * often blank -- an unstaged edit is " M path", beginning with a SPACE. The
 * first version ran the whole output through a helper that trimmed it, which
 * stripped that leading space from the first line only. `slice(3)` then cut one
 * character into the path itself and `git add` was handed `ib/build-info.ts`,
 * which matches nothing. Everything after the first line was untouched, so the
 * failure looked random rather than positional.
 *
 * `-z` rather than newlines: it disables git's quoting of unusual paths, so a
 * filename with a space or a non-ASCII character arrives intact instead of
 * wrapped in quotes and escaped. A rename emits the new path and then the old
 * one as a second record, and only the new path is wanted.
 */
export function changedFiles(raw) {
  const parts = raw.split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    out.push(entry.slice(3));
    // R (renamed) and C (copied) are followed by their source path.
    if (entry[0] === 'R' || entry[0] === 'C') i += 1;
  }
  return out;
}
