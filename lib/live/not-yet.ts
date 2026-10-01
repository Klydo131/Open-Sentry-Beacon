// "Not on this database yet": telling a missing feature from a real failure.
//
// ---------------------------------------------------------------------------
// The app and its database are updated separately. A push reaches the site in
// minutes; the database changes only when somebody runs the new migration. A
// church that updates the code first, a fork that pulls before running
// `supabase db push`, or a deployment whose owner has chosen not to run it
// yet, must keep a conversation that works -- the words, the photos, the live
// refresh -- with the newer things simply not offered until the database has
// them. Asked for on 1 October 2026, for replies, reactions and voice
// (supabase/migrations/20261001120000): the owner's own database stays exactly
// as it is, and the code goes out anyway.
//
// So a read that fails because a table or column is not there is told apart
// from one that fails because the network dropped: the first switches a
// feature off quietly, the second is still an error somebody should see.
// ---------------------------------------------------------------------------

/** Thrown when the database does not have this feature yet. Not a fault. */
export class NotOnThisDatabaseYet extends Error {}

/**
 * Does this error mean "that table, column or function is not here"?
 *
 * PostgREST 12 (Supabase today) answers PGRST205 for a table, PGRST204 for a
 * column and PGRST202 for a function it cannot find; older versions passed
 * Postgres's own 42P01, 42703 and 42883 through. Anything else -- a timeout,
 * a refusal by a security rule -- is a real error and is not swallowed here.
 */
export function isMissingFromDatabase(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (['PGRST205', 'PGRST204', 'PGRST202', '42P01', '42703', '42883'].includes(error.code ?? '')) return true;
  return /could not find the (table|column|function)|(relation|column|function) .* does not exist/i.test(error.message ?? '');
}
