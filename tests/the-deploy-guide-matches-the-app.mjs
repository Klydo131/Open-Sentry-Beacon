// docs/DEPLOY-ANYWHERE.md describes the app as it is, not as it was.
//
// ---------------------------------------------------------------------------
// WHY. A deployment guide is followed literally, by somebody who cannot tell a
// stale file name from a real one. The first draft of this guide named a
// migration that exists in a different repository; it read perfectly and
// pointed at nothing. So every file it names must exist, every setting it names
// must be the one the code reads, and every scenario must say whether this
// project has actually run it.
//
//   node tests/the-deploy-guide-matches-the-app.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const guide = read('docs/DEPLOY-ANYWHERE.md');
const pkg = JSON.parse(read('package.json'));

// 1. Every repository path it names is there. Paths are the backticked words
//    with a slash or a known extension; example files it shows (a Dockerfile it
//    says is not in the repository) are not paths into this one.
{
  const named = new Set();
  for (const m of guide.matchAll(/`([^`\s]+)`/g)) {
    const word = m[1].replace(/[),.:]+$/, '');
    if (/^(https?:|npx|npm|node|\.\/|<)/.test(word)) continue;
    if (/^(app|components|lib|scripts|supabase|tests|docs|\.github)\//.test(word)
        || /^[\w.-]+\.(mjs|ts|tsx|json|sql|md|sh|toml)$/.test(word)) named.add(word);
  }
  const plain = ['package.json', 'next.config.mjs'];
  // Named because they are NOT needed: the guide says so, and they must stay absent.
  const absent = ['supabase/config.toml', 'vercel.json', 'netlify.toml'];
  ok(absent.every((p) => !exists(p)), `${absent.join(', ')} are still absent, as the guide says`);
  const missing = [...named].filter((p) => {
    if (absent.includes(p)) return false;
    if (/^0\d{3}_/.test(p)) return !fs.readdirSync(path.join(root, 'supabase/migrations')).includes(p);
    if (!p.includes('/') && !plain.includes(p)) return !exists(`docs/${p}`) && !exists(p);
    return !exists(p.replace(/\/$/, ''));
  });
  ok(named.size >= 10, `it names ${named.size} files and folders`);
  ok(missing.length === 0,
     missing.length ? `named in the guide, missing from the repository: ${missing.join(', ')}` : 'every one of them exists');
  ok(/no supabase\/config\.toml/.test(guide) === !exists('supabase/config.toml'),
     'and it is right about supabase/config.toml not being there');
}

// 2. The settings it names are the ones the code reads.
{
  const example = read('.env.example');
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    ok(guide.includes(name) && example.includes(`${name}=`), `${name} is in the guide and in .env.example`);
  }
  const floor = pkg.engines?.node?.match(/(\d+)/)?.[1];
  const asked = [...guide.matchAll(/Node(?:\.js)? (\d+)|node:(\d+)/g)].map((m) => m[1] ?? m[2]);
  ok(floor && asked.length > 0 && asked.every((v) => v === floor),
     `every Node version the guide names is ${floor}, as package.json asks (${asked.join(', ')})`);

  const functions = fs.readdirSync(path.join(root, 'supabase/functions'));
  for (const m of guide.matchAll(/functions deploy (\w+)/g)) {
    ok(functions.includes(m[1]), `the function it deploys, ${m[1]}, is in supabase/functions`);
  }
  const invite = read('supabase/functions/invite/index.ts');
  for (const name of ['SITE_URL', 'BREVO_API_KEY', 'BREVO_SENDER']) {
    ok(guide.includes(name) && invite.includes(`'${name}'`), `${name} is the name the invitation function reads`);
  }
  const workflows = fs.readdirSync(path.join(root, '.github/workflows')).map((f) => read(`.github/workflows/${f}`)).join('\n');
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_DB_URL', 'BACKUP_PASSPHRASE']) {
    ok(guide.includes(`\`${name}\``) && workflows.includes(`secrets.${name}`),
       `the GitHub secret ${name} is named in the guide and read by a workflow`);
  }
}

// 3. "This computer" means the same three hostnames in the guide and the policy.
{
  const config = read('next.config.mjs');
  const set = config.match(/THIS_COMPUTER = new Set\(\[(.*)\]\);/)?.[1];
  const hosts = set ? [...set.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
  ok(hosts.length === 3, `the policy allows plain http for ${hosts.length} hostnames`);
  ok(hosts.every((h) => guide.includes(`\`${h}\``)), `and the guide names exactly those: ${hosts.join(', ')}`);
}

// 4. Honesty: every scenario says whether this project has run it.
{
  const sections = guide.split(/\n## /).filter((s) => /^\d\. /.test(s));
  ok(sections.length === 4, `four scenarios (${sections.length})`);
  for (const s of sections) {
    const title = s.split('\n')[0];
    ok(/\*\*Run by this project|\*\*none of it has been run by this project\*\*/i.test(s),
       `"${title}" says whether this project has run it`);
  }
  ok(/never goes anywhere with `NEXT_PUBLIC_`/.test(guide), 'and it says where the service_role key must never go');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
