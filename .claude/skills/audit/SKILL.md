---
name: audit
description: Audit Open Sentry Beacon, or one folder of it, for bugs, security holes, what breaks at a church's load, risky code without tests, slow paths and bloat. A ranked report in plain English; changes nothing. Use for /audit, "audit the code", "find bloat", "what can we delete".
disable-model-invocation: true
---

# Audit

`AGENTS.md` and `CLAUDE.md` come first. Where anything below disagrees, they win.

The method is pstack's Investigation playbook
(`tools/pstack/skills/poteto-mode/playbooks/investigation.md`), in the order
Ponytail 5's audit uses: **correct, safe, holds under load, tested, fast, lean.**
Read a principle in `tools/pstack/skills/` before you cite it. An audit needs at
least Laziness Protocol, Subtract Before You Add, Minimize Reader Load, Fix
Root Causes and Test Behavior, Not Implementation.

1. **Map.** README, ARCHITECTURE.md, `scripts/verify.mjs` (the gate), the entry
   points. Expected load: one church, tens to hundreds of members, phones on
   weak signal.
2. **Go deep where a mistake costs most:** who can read or change what
   (`supabase/migrations`, `lib/live/data.ts`), sign-in, anything a minor can
   see, data kept on the device (`lib/live/kept.ts`), the service worker
   (`app/sw.js/route.ts`). Say which parts you did not read.
3. **Run the levers.** `node scripts/unused-exports.mjs` lists exports nothing
   uses. `node scripts/same-code.mjs` proves a cleanup changed only comments.
4. **Every finding needs a concrete case:** this input leads to this wrong
   result. Search the whole tree (`git grep -w name`) before calling anything
   unused. A `// shortcut:` or `// ponytail:` comment that names its limit is a
   decision, not a finding.
5. **Report** what the app does and the load you assumed, then **Must fix**,
   **Should fix** and **Suggestions**, each with `file:line`, the case and the
   smallest fix. Plain English, full sentences (Caveman is for chat, never for
   a report). A security hole goes to the owner privately, never into a public
   file, issue or commit message.

## Fixing what it found

pstack's Refactoring playbook (`tools/pstack/skills/poteto-mode/playbooks/refactoring.md`):
one verifiable unit per commit, deletions first. A comment-only unit is proven
with `scripts/same-code.mjs`. The owner sees it before `main` (AGENTS.md 0.2).

## Comments

Keep a comment only for a reason the code cannot show: a platform or vendor
rule, a security invariant, a limit chosen on purpose. One to three lines. The
story of a request or a bug goes in the commit message. A test's assertion
message documents its step. `tools/pstack/agents/comment-sicko.md` is the
strict version of this rule.
