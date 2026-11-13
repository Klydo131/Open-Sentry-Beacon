// A stored file path, checked before it becomes part of a URL.
//
// ---------------------------------------------------------------------------
// FOUND BY THE SECURITY REVIEW OF 1 OCTOBER 2026. To open a private file the
// app asks the file store to sign it, and the storage library builds that
// request as `<storage>/object/sign/<bucket>/<path>` with the path pasted in
// as it is, carrying the sign-in of whoever is LOOKING. The path comes from a
// database row, and some of those rows were written by somebody else: the
// other person in a conversation, a Guide who shared a resource, a member who
// attached evidence to a report. A path of `../../auth/v1/logout` turns
// "show me this picture" into "sign me out of every device".
//
// The database now refuses that shape for conversation files
// (20261001120000_a_conversation_can_reply_react_and_speak). This is the same
// rule in the browser, for every bucket, and for rows written before it.
//
// WHAT IS REFUSED is exactly what a browser's URL parser treats as more than
// a name: a `.` or `..` segment, an empty segment, a backslash (read as `/`),
// `%` (so `%2e%2e` cannot become `..`), `?` and `#` (which end the path), a
// leading `/`, and control characters, which the parser silently removes --
// `.<tab>.` arrives as `..`. Every path the app has ever written passes; see
// tests/a-stored-path-cannot-leave-its-folder.mjs.
// ---------------------------------------------------------------------------

/** Is this stored path safe to put into a storage URL? */
export function isSafeStoragePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return false;
  if (/[\u0000-\u001f\u007f\\%?#]/.test(path)) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** The path, or an error a person can read. */
export function safeStoragePath(path: unknown): string {
  if (!isSafeStoragePath(path)) throw new Error('That file could not be opened.');
  return path;
}
