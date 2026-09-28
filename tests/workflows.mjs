// GitHub Actions workflow files, checked for the mistakes YAML cannot catch.
//
// This exists because of one that got through. `keep-warm.yml` gave a
// `uses: actions/github-script@v7` step a `run:` block with JavaScript in it.
// That is perfectly valid YAML — it parsed cleanly with a YAML library, which is
// exactly what I checked — and it is an invalid WORKFLOW: a step either uses an
// action or runs a shell command, never both. GitHub rejected the whole file and
// the workflow never ran once.
//
// The failure is quiet in a specific way worth knowing. A rejected workflow shows
// up in the Actions tab named by its PATH rather than by its `name:`, attributed
// to whichever push introduced it, and the rest of CI goes green around it. So
// "CI passed" and "this workflow has never executed" are comfortably true at the
// same time.
//
// No YAML library is available here and this repository ships almost no
// dependencies on purpose, so this reads the structure line by line. That is
// enough for the class of error involved, which is about which keys sit together
// on one step rather than about deep YAML semantics.
//
//   node tests/workflows.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.github/workflows');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

if (!fs.existsSync(dir)) {
  console.log('OK  no workflows directory, nothing to check');
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
ok(files.length > 0, `${files.length} workflow file(s) found`);

for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = text.split('\n');

  ok(/^\s*name:\s*\S/m.test(text), `${file}: has a name`);
  ok(/^on:|^\s{2}on:|^"on":/m.test(text), `${file}: declares when it runs`);

  // Walk the steps. A step begins with "- " at some indentation; its keys are
  // the lines indented further, until the next step at the same indentation.
  let stepIndent = null;
  let current = null;
  const steps = [];

  const flush = () => {
    if (current) steps.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;

    const dash = line.match(/^(\s*)-\s+(\S.*)$/);
    if (dash) {
      const indent = dash[1].length;
      // A new step at the step indentation, or the first one after `steps:`.
      const prev = lines.slice(0, i).reverse().find((l) => /^\s*steps:\s*$/.test(l));
      if (stepIndent === null && prev !== undefined) stepIndent = indent;
      if (indent === stepIndent) {
        flush();
        current = { line: i + 1, keys: [] };
        const first = dash[2].match(/^([A-Za-z_-]+):/);
        if (first) current.keys.push(first[1]);
        continue;
      }
    }

    if (current) {
      const keyIndent = line.match(/^(\s*)([A-Za-z_-]+):/);
      if (keyIndent && keyIndent[1].length === stepIndent + 2) {
        current.keys.push(keyIndent[2]);
      } else if (line.trim() && line.search(/\S/) <= stepIndent && !dash) {
        // Dedented out of the steps block entirely.
        flush();
        stepIndent = null;
      }
    }
  }
  flush();

  ok(steps.length > 0, `${file}: ${steps.length} step(s) parsed`);

  for (const step of steps) {
    const hasUses = step.keys.includes('uses');
    const hasRun = step.keys.includes('run');

    // THE ONE THAT GOT THROUGH THE SECOND TIME.
    //
    // keep-awake.yml carried TWO `env:` blocks in one step. YAML takes the
    // last, so the two secrets that job exists to use were never passed to it,
    // and GitHub rejected the file outright: a failed run against every push,
    // named by its path because the name could not be read. It could never
    // have gone green, secrets set or not, and the summary line said only
    // "keep-awake failed", which reads like the database is unreachable.
    //
    // The step keys were already being collected right here for the uses/run
    // check. Nothing was looking at them twice.
    const dupes = [...new Set(step.keys.filter((k, i) => step.keys.indexOf(k) !== i))];
    ok(
      dupes.length === 0,
      dupes.length
        ? `${file}:${step.line}: a step repeats ${dupes.map((d) => `\`${d}:\``).join(', ')} — YAML keeps only the last, and GitHub rejects the file`
        : `${file}:${step.line}: no repeated keys`,
    );

    // THE ONE THAT GOT THROUGH.
    ok(
      !(hasUses && hasRun),
      hasUses && hasRun
        ? `${file}:${step.line}: a step has BOTH uses: and run: — GitHub rejects the whole file`
        : `${file}:${step.line}: does not mix uses: and run:`,
    );

    ok(
      hasUses || hasRun,
      hasUses || hasRun
        ? `${file}:${step.line}: does something`
        : `${file}:${step.line}: has neither uses: nor run:`,
    );

    // `with:` configures an action. On a `run:` step it is silently ignored,
    // which reads as a working step that quietly does not do what it says.
    if (step.keys.includes('with') && !hasUses) {
      ok(false, `${file}:${step.line}: with: on a run: step is ignored`);
    }
  }

  // A workflow that opens issues or pushes needs the permission, and the
  // default token is read-only. Missing it fails at the moment it matters,
  // which is during an incident.
  if (/issues\.create|createComment|issues\.update/.test(text)) {
    ok(
      /issues:\s*write/.test(text),
      `${file}: writes issues and grants issues: write`,
    );
  }
}

// NO ACTION ON A RUNTIME GITHUB HAS RETIRED. Every run of every workflow ended
// with "Node.js 20 is deprecated ... actions/checkout@v4, actions/setup-node@v4"
// until 28 September 2026. A warning today is a failed step on the day GitHub
// stops forcing them onto Node 24, and nobody reads warnings on a green run.
// These three majors (v5 and later) run on Node 24.
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of text.matchAll(/uses:\s*actions\/(checkout|setup-node|upload-artifact|download-artifact|cache)@v(\d+)/g)) {
    ok(Number(m[2]) >= 5, `${file}: actions/${m[1]}@v${m[2]} runs on Node 24${Number(m[2]) >= 5 ? '' : ' -- it does NOT; v4 and older run on the retired Node 20'}`);
  }
}

// THE BACKUP SAYS SO WHEN THERE IS NO BACKUP. On the live repository a missing
// database address used to exit cleanly and leave the upload step to fail with
// "No files were found" -- red, but for a reason nobody would connect with
// "the church's data is not being backed up". On a fork it must stay green.
{
  const backup = fs.readFileSync(path.join(dir, 'backup.yml'), 'utf8');
  const noUrl = backup.slice(backup.indexOf('if [ -z "${SUPABASE_DB_URL:-}" ]; then'));
  const upstreamBranch = noUrl.slice(0, noUrl.indexOf('fi\n'));
  ok(/if \[ "\$\{HERE\}" = "\$\{UPSTREAM\}" \]; then[\s\S]*?::error::[\s\S]*?exit 1/.test(upstreamBranch),
    'backup.yml: on the live repository, no database address is an error that says there is no backup');
  ok(/UPSTREAM: Klydo131\/Open-Sentry-Beacon/.test(backup)
     && /UPSTREAM: Klydo131\/Open-Sentry-Beacon/.test(fs.readFileSync(path.join(dir, 'keep-awake.yml'), 'utf8')),
    'backup.yml and keep-awake.yml name the same live repository');
  ok(/echo "made=true" >> "\$GITHUB_OUTPUT"/.test(backup)
     && /- name: Upload encrypted backup\n\s+if: steps\.dump\.outputs\.made == 'true'/.test(backup),
    'backup.yml: the upload runs only when a backup was made, so a fork is not red for having nothing to send');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
