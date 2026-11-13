// The arithmetic behind "activity over time", checked without a browser.
//
// This is the part of the analytics screen that is easy to get subtly wrong and
// impossible to eyeball: bucket boundaries, an unfinished bucket that looks like
// a decline, and a percentage change with nothing to divide by. A church council
// makes decisions off these numbers, so they get a test rather than a look.
//
// Imported straight from the TypeScript. Node 22 strips types natively and CI
// pins node-version: 22, so there is no build step between the code that ships
// and the code that is checked here.
import { trend, momentum, peak, quietCount } from '../lib/analytics-trend.ts';

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const DAY = 24 * 60 * 60 * 1000;
// A Wednesday, mid-afternoon, so week boundaries are not accidentally aligned.
const NOW = new Date('2026-08-05T15:00:00').getTime();
const ago = (ms) => ({ id: String(Math.random()), user_id: 'u', type: 'message', at: new Date(NOW - ms).toISOString() });

// ------------------------------------------------------------- buckets ------
const days = trend([ago(0), ago(DAY), ago(DAY), ago(3 * DAY)], {
  grain: 'day',
  count: 5,
  now: NOW,
});
ok(days.length === 5, 'asks for five days, gets five buckets');
ok(days[4].total === 1, 'today holds today');
ok(days[3].total === 2, 'yesterday holds both of yesterday');
ok(days[2].total === 0, 'a day with nothing in it is kept, not skipped');
ok(days[1].total === 1, 'three days ago is in the right bucket');
ok(days[4].partial && !days[3].partial, 'only the bucket in progress is marked partial');

// The gap is the whole point: an empty bucket dropped instead of drawn would
// draw a busy fortnight where there was a quiet one.
ok(quietCount(days) === 2, `quiet buckets are counted, excluding today (${quietCount(days)})`);

// ------------------------------------------------------------ ordering ------
const starts = days.map((d) => new Date(d.start).getTime());
ok(
  starts.every((t, i) => i === 0 || t > starts[i - 1]),
  'buckets come back oldest first, which is the order they are drawn in',
);

// ------------------------------------------------------------ filtering -----
const mixed = [
  { id: '1', user_id: 'u', type: 'message', at: new Date(NOW).toISOString() },
  { id: '2', user_id: 'u', type: 'stage_advance', at: new Date(NOW).toISOString() },
  { id: '3', user_id: 'u', type: 'stage_advance', at: new Date(NOW - DAY).toISOString() },
];
const advances = trend(mixed, { grain: 'day', count: 3, now: NOW, types: ['stage_advance'] });
ok(
  advances[2].total === 1 && advances[1].total === 1,
  'filtering by type counts only that type',
);
ok(
  trend(mixed, { grain: 'day', count: 3, now: NOW })[2].total === 2,
  'and no filter counts everything',
);

// -------------------------------------------------------------- weeks -------
const weeks = trend([ago(0), ago(8 * DAY), ago(9 * DAY)], {
  grain: 'week',
  count: 4,
  now: NOW,
});
ok(weeks.length === 4, 'four weeks means four buckets');
ok(weeks[3].total === 1, 'this week holds this week');
ok(weeks[1].total + weeks[2].total === 2, 'events from eight and nine days ago land earlier');
const weekStarts = weeks.map((w) => new Date(w.start));
ok(
  weekStarts.every((d) => d.getDay() === 1),
  'weeks start on Monday, because that is how a week is talked about',
);
ok(
  weekStarts.every((d) => d.getHours() === 0 && d.getMinutes() === 0),
  'and at midnight, not at the time of day the page happened to load',
);

// -------------------------------------------------------- out of range ------
const noise = trend([ago(400 * DAY), { id: 'x', user_id: 'u', type: 'message', at: 'not a date' }], {
  grain: 'day',
  count: 5,
  now: NOW,
});
ok(
  noise.every((p) => p.total === 0),
  'events older than the window, and unparseable dates, are ignored rather than counted',
);
const future = trend([{ id: 'f', user_id: 'u', type: 'message', at: new Date(NOW + DAY).toISOString() }], {
  grain: 'day',
  count: 3,
  now: NOW,
});
ok(future.every((p) => p.total === 0), 'an event dated in the future is not counted');

// ----------------------------------------------------------- momentum -------
const up = momentum([
  { start: 'a', label: 'a', total: 10, partial: false },
  { start: 'b', label: 'b', total: 15, partial: true },
]);
ok(up.latest === 15 && up.previous === 10, 'momentum compares the last two buckets');
ok(up.deltaPct === 50 && up.direction === 'up', `15 after 10 is up 50% (${up.deltaPct})`);

const down = momentum([
  { start: 'a', label: 'a', total: 10, partial: false },
  { start: 'b', label: 'b', total: 5, partial: true },
]);
ok(down.deltaPct === -50 && down.direction === 'down', 'and 5 after 10 is down 50%');

// The one that matters. Zero to anything has no percentage, and inventing one
// ("up 100%!") is a lie dressed as arithmetic.
const fromNothing = momentum([
  { start: 'a', label: 'a', total: 0, partial: false },
  { start: 'b', label: 'b', total: 7, partial: true },
]);
ok(fromNothing.deltaPct === null, 'growth from zero has no percentage, and says null');
ok(fromNothing.direction === 'up', 'while still being, plainly, up');

ok(momentum([]).latest === 0, 'no buckets at all does not throw');
ok(momentum([{ start: 'a', label: 'a', total: 4, partial: true }]).deltaPct === null,
  'a single bucket has nothing to compare against');

// --------------------------------------------------------------- peak -------
ok(peak([]) === 1, 'an empty chart scales by one rather than dividing by zero');
ok(
  peak([{ start: 'a', label: 'a', total: 0, partial: false }]) === 1,
  'and so does a chart of an entirely quiet church',
);
ok(
  peak([
    { start: 'a', label: 'a', total: 3, partial: false },
    { start: 'b', label: 'b', total: 9, partial: false },
  ]) === 9,
  'otherwise the tallest bar sets the scale',
);

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
