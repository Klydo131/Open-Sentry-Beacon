// The two things pg_cron and pg_net do on a Supabase project, done here.
//
// THE SCHEDULE. The migrations put three jobs in cron.job (invitation
// passwords running out every hour, deleted files erased and the library's
// link record pruned every night). Every minute this runs whatever is due, as
// the database owner, one job at a time, and writes each run to
// cron.job_run_details, as pg_cron does. Times are UTC, as pg_cron's are.
// Two servers sharing a database do not both run a job: each minute goes to
// whichever takes the lock first.
//
// OUTGOING REQUESTS. When a notification should reach a phone, the database
// queues a request (net.http_post) and carries on. This sends it. A request
// to this server's own functions is answered in-process, with the service key
// put on it here, never stored in the database. A request that fails is tried
// twice more, a minute and then five minutes later, and then left in
// net.http_request_queue with its last error for whoever looks after the
// server.

import pg from 'pg';
import { INTERNAL_FUNCTIONS } from './migrate.mjs';

const RETRY_MINUTES = [1, 5];

function field(spec, min, max) {
  const allowed = new Set();
  for (const part of spec.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cannot read "${part}"`);
    let lo = min;
    let hi = max;
    if (m[1] !== '*') {
      lo = Number(m[2]);
      hi = m[3] !== undefined ? Number(m[3]) : (m[4] ? max : lo);
    }
    const step = m[4] ? Number(m[4]) : 1;
    if (lo < min || hi > max || lo > hi || step < 1) throw new Error(`"${part}" is out of range`);
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return allowed;
}

/** Whether a five-field cron schedule is due at this minute (UTC). */
export function due(schedule, date) {
  const parts = String(schedule).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('a schedule has five fields');
  const [min, hour, dom, mon, dow] = parts;
  const days = field(dom, 1, 31);
  const weekdays = field(dow, 0, 7);
  if (weekdays.has(7)) weekdays.add(0);  // Sunday is 0 or 7
  const dayOk = dom === '*' || dow === '*'
    ? days.has(date.getUTCDate()) && weekdays.has(date.getUTCDay())
    : days.has(date.getUTCDate()) || weekdays.has(date.getUTCDay());
  return field(min, 0, 59).has(date.getUTCMinutes())
    && field(hour, 0, 23).has(date.getUTCHours())
    && field(mon, 1, 12).has(date.getUTCMonth() + 1)
    && dayOk;
}

export function createJobs({ cfg, pool, functions }) {
  let stopped = false;
  let minuteTimer = null;
  let pollTimer = null;
  let listener = null;
  let draining = false;

  async function runDue(at) {
    const client = await pool.connect();
    try {
      const { rows: lock } = await client.query(`select pg_try_advisory_lock(hashtext('beacon_platform.cron')) as ok`);
      if (!lock[0].ok) return;
      try {
        const { rows: jobs } = await client.query('select jobid, schedule, command from cron.job where active order by jobid');
        for (const job of jobs) {
          let isDue;
          try {
            isDue = due(job.schedule, at);
          } catch (err) {
            isDue = false;
            console.error(JSON.stringify({ at: 'cron', job: job.jobid, error: `schedule unreadable: ${err.message}` }));
          }
          if (!isDue) continue;
          const started = new Date().toISOString();
          let status = 'succeeded';
          let message = '';
          try {
            await client.query('begin');
            await client.query(`set local statement_timeout = '5min'`);
            const result = await client.query(job.command);
            await client.query('commit');
            const last = Array.isArray(result) ? result[result.length - 1] : result;
            message = `${last?.command ?? ''} ${last?.rowCount ?? ''}`.trim();
          } catch (err) {
            await client.query('rollback').catch(() => {});
            status = 'failed';
            message = err.message;
          }
          await client.query(
            `insert into cron.job_run_details (jobid, database, username, command, status, return_message, start_time, end_time)
             values ($1, current_database(), current_user, $2, $3, $4, $5, now())`,
            [job.jobid, job.command, status, message.slice(0, 2000), started]);
          // Keep a month of history, as a small table.
          await client.query(`delete from cron.job_run_details where end_time < now() - interval '31 days'`);
        }
      } finally {
        await client.query(`select pg_advisory_unlock(hashtext('beacon_platform.cron'))`);
      }
    } finally {
      client.release();
    }
  }

  function scheduleMinute() {
    if (stopped) return;
    const now = Date.now();
    const next = Math.ceil((now + 1) / 60_000) * 60_000;
    minuteTimer = setTimeout(async () => {
      try {
        await runDue(new Date(next));
      } catch (err) {
        console.error(JSON.stringify({ at: 'cron', error: err.message }));
      }
      scheduleMinute();
    }, next - now + 50);
    minuteTimer.unref?.();
  }

  async function send(row) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(row.headers || {})) headers.set(key, String(value));
    const body = row.body ? Buffer.from(row.body) : undefined;
    if (row.url.startsWith(`${INTERNAL_FUNCTIONS}/`)) {
      const name = row.url.slice(INTERNAL_FUNCTIONS.length + 1).split(/[?#]/)[0];
      headers.set('Authorization', `Bearer ${cfg.serviceKey}`);
      const res = await functions.invoke(name, new Request(row.url, { method: row.method, headers, body }));
      if (res.status >= 500) throw new Error(`${name} answered ${res.status}`);
      return;
    }
    const res = await fetch(row.url, {
      method: row.method, headers, body, signal: AbortSignal.timeout(Math.max(1000, row.timeout_milliseconds)),
    });
    if (res.status >= 500) throw new Error(`answered ${res.status}`);
  }

  async function drain() {
    if (draining || stopped) return;
    draining = true;
    try {
      for (;;) {
        const { rows } = await pool.query(
          `update net.http_request_queue q set attempts = attempts + 1, next_try_at = now() + interval '10 minutes'
            where id in (select id from net.http_request_queue
                          where attempts <= $1 and next_try_at <= now()
                          order by id for update skip locked limit 10)
           returning *`, [RETRY_MINUTES.length]);
        if (rows.length === 0) break;
        await Promise.all(rows.map(async (row) => {
          try {
            await send(row);
            await pool.query('delete from net.http_request_queue where id = $1', [row.id]);
          } catch (err) {
            const wait = RETRY_MINUTES[row.attempts - 1];
            await pool.query(
              `update net.http_request_queue set last_error = $2,
                      next_try_at = case when $3::int is null then 'infinity'::timestamptz else now() + make_interval(mins => $3::int) end
                where id = $1`, [row.id, String(err.message).slice(0, 1000), wait ?? null]);
          }
        }));
      }
    } catch (err) {
      console.error(JSON.stringify({ at: 'net', error: err.message }));
    } finally {
      draining = false;
    }
  }

  async function listen(attempt = 0) {
    if (stopped) return;
    const client = new pg.Client({ connectionString: cfg.databaseUrl, application_name: 'beacon-net' });
    client.on('notification', () => { void drain(); });
    client.on('error', () => {});
    client.on('end', () => {
      listener = null;
      if (!stopped) setTimeout(() => listen(attempt + 1), Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    });
    try {
      await client.connect();
      await client.query('listen beacon_net');
      listener = client;
    } catch {
      client.end().catch(() => {});
    }
  }

  return {
    async start() {
      scheduleMinute();
      await listen();
      // A request queued while the server was down, or due for a retry.
      pollTimer = setInterval(() => { void drain(); }, 30_000);
      pollTimer.unref?.();
      void drain();
    },
    async stop() {
      stopped = true;
      clearTimeout(minuteTimer);
      clearInterval(pollTimer);
      if (listener) await listener.end().catch(() => {});
    },
    runDue,
    drain,
  };
}
