// There is no linter in this project, and this says so out loud.
//
// WHAT `npm run lint` USED TO DO. It ran `next lint`, which found no ESLint
// configuration, and so opened an INTERACTIVE WIZARD asking which style you
// would like -- and a stray Enter writes a config file into the checkout. A
// developer's first read of a codebase should not begin by being asked to make
// a decision nobody has made, in a prompt that looks like an error.
//
// WHAT THAT HID, which is the part worth knowing. ESLint is not in
// devDependencies, there is no .eslintrc or eslint.config anywhere, and neither
// the verify gate nor CI has ever run it. Meanwhile the source carries 45
// `eslint-disable-next-line` comments across 7 files -- 42 of them for
// react-hooks/exhaustive-deps. Every one of them READS as a considered
// suppression that somebody weighed, and not one has ever suppressed anything,
// because no linter has ever run to be suppressed. That is a misleading comment
// repeated 45 times, which is worse than no comment at all.
//
// The 42 dependency-array suppressions are the real question underneath. Each
// one is a hook whose dependencies were deliberately left incomplete, and each
// is a possible stale closure. Answering that is a considered pass with tests
// behind it, not a `--fix`.
//
// So this script does the one useful thing available: it tells the truth and
// fails, rather than opening a wizard. Replace it the day ESLint is actually
// installed and wired into scripts/verify.mjs.

const LINES = [
  'No linter is configured in this project.',
  '',
  '  ESLint is not installed, there is no config file, and neither',
  '  `npm run verify` nor CI runs one.',
  '',
  '  The 45 `eslint-disable-next-line` comments in components/, lib/ and app/',
  '  therefore suppress nothing. They read as decisions somebody made and are',
  '  inert. 42 of them are react-hooks/exhaustive-deps.',
  '',
  '  Setting ESLint up is a real piece of work: it will surface findings across',
  '  47k lines, and the dependency-array ones need judgement rather than --fix.',
  '  Until somebody does it, this command fails instead of pretending.',
  '',
  '  See docs/DATA-PROTECTION.md for the house style on this kind of gap: name',
  '  it, do not paper over it.',
];

console.error(LINES.join('\n'));
process.exit(1);
