// The link checker must tell a wrong address from a site that dislikes robots.
//
// WHY THIS TEST EXISTS. `scripts/check-links.mjs` was written to catch a wrong
// address on the church's shelf. Its first real run called four links dead.
// Three of them open perfectly in a browser: kingjamesbibleonline.org,
// adventistarchives.org and gcyouthministries.org all answer 403 to a GitHub
// runner, and hopetv.org answered 429 because the checker had just made
// nineteen requests in ten seconds. One self-inflicted, three not.
//
// A checker that goes red for those is worse than no checker, because the
// church learns to click past it, and then it goes red for a real 404 and
// nobody looks. So the classification is the load-bearing part, and it is the
// part that was wrong — which is why it has a test and the twenty addresses do
// not. This runs against a server on localhost, so it needs no network and
// bothers no publisher.
//
//   node tests/dead-is-not-refused.mjs
//
// Plain Node, no dependencies. Exits non-zero on any violation.
import http from 'node:http';
import { reach, verdictFor } from '../scripts/check-links.mjs';

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Answers whatever status the path asks for, on every verb.
const server = http.createServer((req, res) => {
  const code = Number(req.url.slice(1)) || 200;
  res.writeHead(code, { 'Content-Type': 'text/plain' });
  res.end(code === 200 ? 'here' : String(code));
});
await new Promise((go) => server.listen(0, '127.0.0.1', go));
const base = `http://127.0.0.1:${server.address().port}`;

const verdictOf = async (code) => (await reach(`${base}/${code}`)).verdict;

// The reason the shelf is checked at all: an address that is simply wrong.
ok((await verdictOf(404)) === 'DEAD', 'a 404 is DEAD — this is the whole point');
ok((await verdictOf(410)) === 'DEAD', 'a 410 is DEAD');
ok((await verdictOf(500)) === 'DEAD', 'a 500 is DEAD; the publisher is broken, say so');

// A live site declining an automated request. Reported, never fatal.
for (const code of [401, 403, 405, 406, 429, 503]) {
  ok((await verdictOf(code)) === 'REFUSED', `a ${code} is REFUSED, not DEAD`);
}

ok((await verdictOf(200)) === 'OK', 'a 200 is OK');

// A hostname that does not resolve is the other shape of a wrong address, and
// it must not be mistaken for a refusal just because there is no status code.
const nowhere = await reach('http://this-host-does-not-exist.invalid/');
ok(nowhere.verdict === 'DEAD', `an unresolvable host is DEAD (${nowhere.detail})`);

// A SITE THAT DID NOT ANSWER IS ASKED ONCE MORE; AN ANSWER IS BELIEVED.
// bibleinfo.com timed out once on 28 September 2026, a week after answering
// 200, and turned the whole shelf red. The second ask is for silence only.
{
  const script = (answers) => {
    const asked = [];
    return { asked, once: async (url) => { asked.push(url); return answers.shift(); } };
  };
  const slow = script([{ verdict: 'DEAD', detail: 'timed out' }, { verdict: 'OK', detail: 200 }]);
  const slowV = await verdictFor('x', { once: slow.once, wait: 0 });
  ok(slowV.verdict === 'OK' && slow.asked.length === 2, 'a site that timed out once is asked again, and passes when it answers');

  const gone = script([{ verdict: 'DEAD', detail: 404 }, { verdict: 'OK', detail: 200 }]);
  const goneV = await verdictFor('x', { once: gone.once, wait: 0 });
  ok(goneV.verdict === 'DEAD' && gone.asked.length === 1, 'a 404 is believed the first time and never asked twice');

  const lapsed = script([{ verdict: 'DEAD', detail: 'getaddrinfo ENOTFOUND' }, { verdict: 'DEAD', detail: 'getaddrinfo ENOTFOUND' }]);
  const lapsedV = await verdictFor('x', { once: lapsed.once, wait: 0 });
  ok(lapsedV.verdict === 'DEAD', 'a host that does not resolve is still DEAD after the second ask');

  const refused = script([{ verdict: 'REFUSED', detail: 403 }]);
  await verdictFor('x', { once: refused.once, wait: 0 });
  ok(refused.asked.length === 1, 'a refusal is not asked again: the publisher already said no once');
}

server.close();

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
