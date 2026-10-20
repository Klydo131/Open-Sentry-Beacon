# Emergency deployment

What to do when the live app is broken and people are waiting. This page is for
whoever runs a copy of Hope Beacon. You are responsible for your own copy, so
adapt the steps to your own host and keep them somewhere your team can find them
on a bad day.

The examples use Vercel and GitHub, which is what this repository is set up for.
On another host the shape is the same: put back the last version that worked,
then fix forward.

## 1. Put back the last good version (minutes, no build)

Rolling back is the fastest way to stop the damage, because nothing is built.
The hosting platform points your address back at a version it has already
built.

- **Vercel dashboard:** your project, then **Deployments**, then the last
  production deployment that worked, then the **⋯** menu, then **Instant
  Rollback**.
- **Vercel command line:** `vercel rollback <deployment-url-or-id>`, then
  `vercel rollback status`.

Limits worth knowing before you need them:

- On Vercel's free (Hobby) plan you can only roll back to the production
  deployment just before the current one. Paid plans can go further back.
- A rollback changes the app's code, not your database. If the bad version
  changed the database, rolling back the code does not undo that; see section 4.
- Afterwards, look at the **Deployments** page before you push again. If Vercel
  says new pushes will not go live automatically, promote the fixed deployment
  yourself when it is ready (`vercel promote <deployment-url>`).

## 2. Fix forward with the emergency lane

When a rollback is not enough (or not possible), make the smallest change that
fixes the problem and send it through the short checks.

1. Start from what is live: `git fetch origin main && git switch -c hotfix/<what> origin/main`.
2. Change as little as possible. No refactoring and no tidying.
3. On your computer, run the same short checks CI will run:

   ```bash
   node scripts/verify.mjs --quick
   ```

4. Push the branch, open a pull request, and add the **`emergency`** label.
5. CI then runs one job on one machine: typecheck, build, and the checks that
   protect data and access (no secrets in the code, no privilege
   escalation, sessions that end when they should, the content security policy,
   data protection). The browser walks, Windows, macOS and Safari are skipped
   for this pull request.
6. Merge when it is green. The host builds `main` and the fix goes live when
   that build finishes.
7. If a run sits in **Queued**, before or after the merge, GitHub's runners are busy with other pull
   requests (Dependabot's, usually). Cancel those runs in the **Actions**
   tab; they can be re-run later.
8. **Watch the full run on `main`.** The merge runs every check, including the
   ones the emergency lane skipped. If something fails there, fix it in an
   ordinary pull request.

Only people with write access to the repository can add a label, so somebody
opening a pull request from a fork cannot use the emergency lane to skip checks.

**One-time setup:** create the label in GitHub (**Issues**, then **Labels**,
then **New label**, named `emergency`). If your branch rules list required
checks by name, see section 5.

## 3. What a normal pull request runs, and how long it takes

| Job | What it runs | Where |
| --- | --- | --- |
| `verify` | Typecheck, build and every static check | Ubuntu, Windows and macOS, side by side |
| `walks (1)` to `walks (4)` | The browser walks, split across four machines | Ubuntu |
| `safari` | Browser walks on Safari's engine (WebKit) | macOS |
| `fresh-install` | A brand-new database built from the migrations | Ubuntu |

Before this change, the browser walks ran on one machine and took about 19
minutes, so every pull request waited about 20 minutes for its slowest job.
Measured on GitHub on 20 October 2026, the first full run after the split:

| Job | Took |
| --- | --- |
| `verify` on Ubuntu | 4 minutes |
| `verify` on Windows | 3½ minutes |
| `verify` on macOS | 5½ minutes, after waiting 10½ minutes for a free Mac |
| `walks (1)` | 10 minutes (the longest of the four) |
| `walks (2)`, `(3)`, `(4)` | 5½, 5½ and 7 minutes |

So a pull request now waits about 10 minutes for its slowest walk, down from
about 20. GitHub has fewer Mac machines than Linux ones, so on a busy day the
macOS job can wait in the queue longer than it runs; the emergency lane skips
it for that reason.

The build also keeps Next.js's compile cache between runs, and a newer push to
the same pull request cancels the run it replaces.

## 4. When the database is involved

Database changes (`supabase/migrations/`) are not applied by CI or by the host.
They are run by hand, so they are never part of an emergency lane.

- If a database change caused the problem, write a new change that undoes it,
  test it on a scratch project, and apply it the same way as any other. Do not
  edit a change that has already been applied.
- If the app's new code needs a database change that has not been applied yet,
  rolling the code back (section 1) is usually the quickest safe fix.

## 5. If your branch rules require named checks

The walks used to report as one check named `walks`. They now report as
`walks (1)` to `walks (4)`. If your repository's branch protection lists `walks`
as a required check, replace it with the four new names, or pull requests will
wait for a check that never comes. Checks skipped by the emergency lane count
as passed.
