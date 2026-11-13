# Research agents

Three reviewers anybody can run before a change ships, with whatever AI tool
they use. They read and report; none of them changes the code. A person reads
the report, decides, and makes the change through the usual route
([AGENTS.md](../../AGENTS.md) section 0.2: plan it, show it, test it, and the
owner sees it before it is pushed).

**Security comes first.** When the security reviewer and anything else
disagree, the security finding wins until a person has decided otherwise in
writing.

| Agent | Run it when | Definition |
|---|---|---|
| **Security reviewer** | Any change to the database, sign-in, files, the chat, the headers, or anything a minor could see | [`.claude/agents/security-reviewer.md`](../../.claude/agents/security-reviewer.md) |
| **Design researcher** | Before redesigning a screen, to learn from how well-made open-source apps solve the same problem | [`.claude/agents/design-researcher.md`](../../.claude/agents/design-researcher.md) |
| **Licence auditor** | Before adding a dependency, an image, a font or a third-party service, and before a release | [`.claude/agents/licence-auditor.md`](../../.claude/agents/licence-auditor.md) |

## How to run them

**Claude Code** picks the definitions up from `.claude/agents/` on its own.
Ask for one by name: *"Run the security-reviewer on my changes."*

**Any other tool** (Codex, Cursor, Copilot, a chat window): open the
definition, copy everything below the `---` lines, and give it to the tool as
its instructions, followed by what to review. The rules inside apply whatever
the tool.

## The rules every agent here keeps

- **Read-only.** No agent edits the repository, installs anything, or
  publishes anything.
- **No real data, anywhere.** No member's name, email, photo or project
  reference goes into a prompt, a search, a report or a commit. Use the sample
  church's invented people.
- **Never against a live system.** No agent contacts a deployed site or a real
  database with real data. Database rules are tested on a throwaway database
  (`scripts/fresh-install.sh`, and the behaviour files in `supabase/tests/`).
- **Ideas are free, code has a licence.** This project is AGPL-3.0-only. Learn
  from how any app behaves; copy code only from projects whose licence is
  compatible (MIT, BSD, ISC, Apache-2.0, MPL-2.0, LGPL/GPL-3.0-or-later,
  AGPL-3.0), and say where it came from. Never copy another company's name,
  logo, icons, colours or distinctive look.
- **Say what was not checked.** An honest "not verified" is a finding. A guess
  presented as a check is the thing these agents exist to prevent.

## Where their first reports went

The first run of all three, on 1 October 2026 for the new chat, is summarised
in [docs/CHAT-RESEARCH.md](../CHAT-RESEARCH.md): what other open-source chats
do well, what was adopted, what was refused and why, and the security and
licence findings with what was done about each.
