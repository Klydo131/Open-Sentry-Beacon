// ---------------------------------------------------------------------------
// The update floor: the oldest build the server will still serve people on.
//
// Beacon already updates itself. The app asks /version.json on launch, when it
// comes back to the front and every fifteen minutes, notices when the server
// has moved on, and offers a one-tap restart that never requires uninstalling
// anything. What it did not have was a floor. Every update was optional, so a
// phone left closed for two months — or one whose owner has tapped "later"
// enough times — could keep running an old bundle indefinitely against a
// database that has moved on. That is fine for a cosmetic release. It is not
// fine for one that changes what a screen is allowed to show, which is exactly
// the kind of release this app has shipped.
//
// So the server publishes the oldest build it still supports, and a bundle
// older than that gets told so, insistently: the reminder says more and comes
// back in an hour rather than in eight. It is still a reminder. Nobody is walled
// out of their own data, because a wall stops the person who is mid-sentence in
// a prayer request just as surely as it stops the person who has been ignoring
// updates for a month, and it strands anybody whose signal drops at the wrong
// moment.
//
// The floor is OFF by default and stays off. It is raised deliberately, for one
// release, by setting BEACON_MIN_BUILD_TIME in the hosting environment. A floor
// that becomes routine is a floor people learn to tune out, and an insistent
// reminder only works while it is rare enough to be believed.
//
// Both halves live here, in one dependency-free module, so the rule the server
// publishes and the rule the browser applies are provably the same rule and can
// be exercised without a browser or a server. tests/min-build.mjs is that test.
// Plain .mjs rather than .ts: shared logic that has to be testable in bare node
// with no build step, and it imports into TypeScript unchanged.
// ---------------------------------------------------------------------------

/**
 * Milliseconds since the epoch, or null for anything we cannot read.
 * @param {unknown} value
 * @returns {number | null}
 */
function parseTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Work out what floor this server should publish.
 *
 * @param {string | null | undefined} raw  BEACON_MIN_BUILD_TIME as configured, if at all.
 * @param {string} serverBuildTime  BUILD_TIME of the build answering the request.
 * @returns {string | null} an ISO timestamp, or null meaning "no floor" — the
 *   normal state, and the default.
 */
export function resolveMinBuildTime(raw, serverBuildTime) {
  const wanted = parseTime(raw);

  // Unset is off. A typo is also off: a value nobody can parse must not be
  // guessed at, because every guess here nags somebody about nothing.
  if (wanted === null) return null;

  const serving = parseTime(serverBuildTime);

  // A server cannot hand out a build it does not have. A floor set past this
  // deployment's own build would nag every copy in existence, including one
  // installed thirty seconds ago, about an update that does not exist to be
  // downloaded: a reminder nobody can ever satisfy, which is how people learn to
  // ignore reminders.
  //
  // Clamping means the worst a mistyped floor can do is "everybody has to be on
  // the newest build", which is at least a state people can reach.
  if (serving !== null && wanted > serving) {
    return new Date(serving).toISOString();
  }

  return new Date(wanted).toISOString();
}

/**
 * Is the bundle running in this browser older than the floor?
 *
 * Deliberately biased towards "no". Every uncertain answer — no floor, an
 * unreadable floor, a bundle with no stamp — resolves to false. Being wrong in
 * this direction costs one gentle reminder instead of an insistent one. Being
 * wrong in the other direction pesters somebody who is already up to date, and
 * a reminder that cries wolf is a reminder nobody reads.
 *
 * @param {string | null | undefined} bundleBuildTime  BUILD_TIME of this bundle.
 * @param {string | null | undefined} minBuildTime  the floor from /version.json.
 * @returns {boolean}
 */
export function isBelowFloor(bundleBuildTime, minBuildTime) {
  const floor = parseTime(minBuildTime);
  if (floor === null) return false;
  const mine = parseTime(bundleBuildTime);
  if (mine === null) return false;
  return mine < floor;
}
