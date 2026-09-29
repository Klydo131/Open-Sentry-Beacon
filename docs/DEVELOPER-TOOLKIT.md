# Developer toolkit

The agent tools this project uses, the ones it recommends, and the ones it looked
at and left out, with the reason for each. For anybody setting up Claude Code or
Codex to work on Open Sentry Beacon, or moving an existing setup across.

**Nothing on this page is switched on by cloning the repository.** There is no
`.mcp.json` here, no other agent's project setup, and no `.claude/settings.json`
that installs a plugin, adds a server, registers a hook, allows a tool or sets
the environment a session runs in. A shared settings file may only take power
away, and `tests/the-toolkit-is-opt-in.mjs` keeps it that way. Every tool
below is something a developer chooses, on their own machine.
That is deliberate: several of these run code by themselves at the start or end
of every session, and a public repository that turned them on for whoever cloned
it would be handing that choice to a stranger.

**How this list was made (29 September 2026).** From a list of thirty popular
Claude Code add-ons the owner shared. Each repository was fetched and checked
for four things: that it exists under that name, its licence, whether it
registers Claude Code hooks (code that runs on its own during a session) and on
which events, and how big it is. The commit each was read at is recorded in
[`tools/developer-toolkit.json`](../tools/developer-toolkit.json), so a later
change upstream can be told apart from what was looked at. Nobody ran these
tools against this repository for the review; installing one is still a
decision to read its own README first.

**Rechecked the same day, against the same commits,** for what each tool runs
and what it sends, reading its installer as well as its hook files. Three
entries had been wrong: Ponytail registers a third hook (when a subagent
starts); CodeGraph's installer adds an MCP server, a prompt hook and usage
statistics that had been listed as "none"; and the Codex plugin's Stop hook
is its optional review gate, not the end of its helper. A hook file alone
does not say what an installer writes.

Matched by name and description to the list that was shared. Where two names
could fit, the one with that exact name and purpose was taken.

## The rules

1. **Caveman and Ponytail first.** They are the project's own (owner's forks)
   and how they are used here is in [AGENTS.md section 0.1](../AGENTS.md).
2. **Nothing here outranks AGENTS.md, CLAUDE.md or docs/VISUAL-LANGUAGE.md.**
   A skill that says otherwise is wrong about this project.
3. **No tool that sends a session somewhere new.** Sessions here can read live
   member data. A tool that records sessions, or routes them to another company,
   is left out whatever else it is good at.
4. **A new tool is added to this page before it is used**, with its commit, its
   licence and what it runs on its own. The test fails if the page and the list
   disagree.
5. **npm tools are run at a pinned version with npx**, never added to
   `package.json`: they are a developer's tools, not the app's dependencies.
6. **Install for yourself, never for this project.** Some installers offer to
   set a tool up for this project only. That writes files into the
   repository (`.mcp.json`, `.claude/`, `.codex/`, `.cursor/mcp.json`,
   `.vscode/mcp.json`, a section of AGENTS.md) that would switch the tool on
   for everybody who clones it. Choose your own user, or all your projects,
   every time. Those files are in `.gitignore`, so a copy on your machine is
   never swept into a commit, and the gate refuses one added by force; a
   section written into AGENTS.md or CLAUDE.md fails the gate at once.
7. **What leaves your machine is written down.** Every tool below says what
   it sends, and "nothing" is a claim that was checked, not assumed.


## Already ours

| Tool | What it does | Install | Runs on its own | Sends |
| --- | --- | --- | --- | --- |
| **Caveman** (`Klydo131/caveman`) | The project's token saver, from the owner's fork of JuliusBrussee/caveman. Rules for its use are in AGENTS.md section 0.1. | Claude Code:<br>`claude plugin marketplace add Klydo131/caveman`<br>`claude plugin install caveman@caveman`<br>Codex:<br>`git clone https://github.com/Klydo131/caveman`<br>open Codex in that folder, then /plugins, search Caveman, Install | SessionStart, UserPromptSubmit (sets the mode) | nothing |
| **Ponytail** (`Klydo131/ponytail`) | The project's code minimiser, from the owner's fork of DietrichGebert/ponytail. Rules for its use are in AGENTS.md section 0.1. | Claude Code:<br>`claude plugin marketplace add Klydo131/ponytail`<br>`claude plugin install ponytail@ponytail`<br>Codex:<br>`codex plugin marketplace add Klydo131/ponytail`<br>in Codex: /plugins, the Ponytail marketplace, Install; then /hooks to review and trust its hooks | SessionStart, SubagentStart, UserPromptSubmit (loads its rules, into subagents too, and tracks its mode) | nothing |

Both forks are exact copies of their authors' work: every commit in them is
upstream's. They sit under the owner's account so that a change upstream
reaches this project only after somebody has read it. Their own READMEs
still name the original repositories, and that is deliberate: a fork left
identical to upstream updates with a clean fast-forward. **To update one:**
read what changed upstream, sync the fork, then record its new commit in
`tools/developer-toolkit.json` with anything it now runs or sends. The Codex
steps are each fork's own README pointed at the fork. They have not been run
from here, because this sandbox has no Codex.

**Where the two forks stand (29 September 2026).**

- **Caveman: stay on the fork for now.** Upstream is 622 commits ahead and
  has moved parts of its repository (its engine, proxy, browser driver, MCP
  server and more) to the Business Source License, which is not an
  open-source licence; new engine-linked parts default to it. The skill and
  the hooks this project uses stay MIT upstream, but a sync would bring the
  rest into the owner's public fork. It stays on its all-MIT copy until
  somebody decides otherwise, having read upstream's `LICENSING.md`.
- **Ponytail: safe to sync.** Upstream is 62 commits ahead: adapters for
  more agents and documentation. It is still MIT, with the same three Claude
  Code hooks, nothing new that reaches the network and no new dependencies.
  A sync is a fast-forward; record the new commit here afterwards.

## Recommended, opt-in

Each is small enough to read and has a licence. None sends a session
anywhere by itself; the Sends column says exactly what does leave your
machine, as each tool describes it at the commit recorded.

| Tool | Why here | Install | Runs on its own | Sends | Licence |
| --- | --- | --- | --- | --- | --- |
| **Superpowers** (`obra/superpowers`) | Planning, test-first and systematic debugging as skills the agent reaches for. One hook, at session start, that only adds text. Installed from Anthropic's official directory, as its own README says; the commit recorded is the one read on the day it was reviewed. | `claude plugin install superpowers@claude-plugins-official` | SessionStart (loads its skills list) | nothing | MIT |
| **Anthropic skills** (`anthropics/skills`) | Anthropic's own skills. document-skills makes the PDF and Word copies of the guides in docs/handbook without new code here. Read each skill's own licence before copying it into this AGPL repository: some may be used but not redistributed. | `claude plugin marketplace add anthropics/skills`<br>`claude plugin install document-skills@anthropic-agent-skills` | none | nothing | per skill (some source-available, not open source) |
| **Codex plugin for Claude Code** (`openai/codex-plugin-cc`) | Claude and Codex already share this repository (AGENTS.md section 7). This lets one hand a review to the other without leaving the session. Needs the developer's own Codex sign-in. Leave its review gate off in any session that has read live member data: with the gate on, every finished answer goes to Codex. | `npm install -g @openai/codex@0.158.0`<br>`claude plugin marketplace add openai/codex-plugin-cc`<br>`claude plugin install codex@openai-codex` | SessionStart and SessionEnd (start and stop its helper); Stop, which does nothing unless its review gate is switched on, and then hands every finished answer to Codex | whatever it is handed, to OpenAI under the developer's own Codex account; with the review gate on, every finished answer | Apache-2.0 |
| **Claude HUD** (`jarrodwatts/claude-hud`) | Shows how much of the context and the budget a session has used, which is the number Caveman is there to bring down. | `claude plugin marketplace add jarrodwatts/claude-hud`<br>`claude plugin install claude-hud@claude-hud` | a status-line command, each time the line is drawn | nothing | MIT |
| **Repomix** (`yamadashy/repomix`) | Packs the repository into one file for a review or a second opinion. It follows .gitignore, so .env files and build output stay out. Run on demand, at a pinned version, never installed into package.json. | `npx repomix@1.18.1` | none | nothing: it writes one file on the developer's machine | MIT |
| **CodeGraph** (`colbymchenry/codegraph`) | A local index of the code that an agent can search instead of reading whole files: fewer tokens on a repository this size. When its installer asks, choose all your projects, never just this one (that writes .mcp.json, .claude/, .codex/ and a section of AGENTS.md into this repository), and switch usage statistics off, or set DO_NOT_TRACK=1, which also stops its version check. | `npx @colbymchenry/codegraph@1.6.0` | an MCP server the agent starts every session, and a UserPromptSubmit hook unless it is declined in the installer; the installer also adds a CodeGraph section to the agent's instructions file and allows its tools | anonymous usage counts (never code, paths, names or questions, by its own published list) until switched off, and a daily check with GitHub for a newer version | MIT |
| **Taste** (`Leonxlnx/taste-skill`) | A design skill for pages that look finished. docs/VISUAL-LANGUAGE.md outranks it whenever they disagree: navy is the only press-me colour, drawn icons, nothing read under 13px. | `claude plugin marketplace add Leonxlnx/taste-skill`<br>`claude plugin install taste-skill@taste-skill` | none | nothing | MIT |
| **Claude plugin directory** (`anthropics/claude-plugins-official`) | Anthropic's own directory. The place to find anything not listed here; whatever is taken from it is added to this list first, with what it runs. | `claude plugin marketplace add anthropics/claude-plugins-official` | depends on the plugin chosen | depends on the plugin chosen | Apache-2.0 (each plugin its own) |

## Not repeated: the project already does this

| Tool | What already covers it |
| --- | --- |
| **Playwright MCP** (`microsoft/playwright-mcp`) | Every screen is already walked in a real browser by tests/e2e (Chromium here, WebKit in CI), and agents run those walks. A second way to drive a browser would be a second thing to trust. |
| **GitHub MCP server** (`github/github-mcp-server`) | Cloud sessions already have GitHub through their own connector, and a local developer has the gh command. |
| **Karpathy skills** (`forrestchang/andrej-karpathy-skills`) | One CLAUDE.md of general rules. This project's AGENTS.md and CLAUDE.md are that, written from its own mistakes. There is also no licence to reuse it under. |
| **Learn Claude Code** (`shareAI-lab/learn-claude-code`) | A small harness to read and learn from. The project's harness is AGENTS.md plus the verify gate. |
| **Claude Code best practice** (`shanraisshan/claude-code-best-practice`) | A guide, and a set of hooks on nine events. AGENTS.md is this project's practice, and nothing here needs hooks on nine events. |
| **Planning with files** (`OthmanAdi/planning-with-files`) | Plans that survive a restart are what the reports in reports/llm/ and AGENTS.md already do, without hooks on six events. |

## Looked at and left out

| Tool | Why not |
| --- | --- |
| **Everything Claude Code (ECC)** (`affaan-m/everything-claude-code`) | About 4,000 files and hooks on six events. Sessions here touch live pastoral data; a harness that size cannot be read before it is trusted. |
| **gstack** (`garrytan/gstack`) | Twenty-five opinionated tools in about 2,800 files, most of them overlapping the verify gate and AGENTS.md. |
| **UI UX Pro Max** (`nextlevelbuilder/ui-ux-pro-max-skill`) | A second design skill beside Taste. One is enough, and docs/VISUAL-LANGUAGE.md outranks both. |
| **claude-mem** (`thedotmack/claude-mem`) | It records every session into a memory store. Sessions here read live member data, so that would be a second copy of it on a laptop, outside the church's control. Not for this project. |
| **graphify** (`safishamsi/graphify`) | A codebase map, the same job as CodeGraph. One index is enough. |
| **Agents marketplace** (`wshobson/agents`) | A marketplace of many agents. Take a single agent through the official directory if one is ever needed, and list it here first. |
| **Claude Code Router** (`musistudio/claude-code-router`) | Routes the session to other model providers, which sends whatever the session holds, live data included, to more companies. |
| **CC Switch** (`farion1231/cc-switch`) | A personal desktop app that keeps API keys for several agents. A developer's own choice, not part of this project's setup. |
| **Multica** (`multica-ai/multica`) | Sends one issue to many agents at once, in about 6,400 files. This project runs two agents on one branch by protocol (AGENTS.md section 7). |
| **Vibe Kanban** (`BloopAI/vibe-kanban`) | A board for many agents' work, in about 2,200 files. Nothing here runs enough agents at once to need one. |
| **Firecrawl** (`firecrawl/firecrawl`) | Web scraping through a hosted service and an API key. Nothing in this project scrapes the web. |
| **Awesome MCP servers** (`punkpeye/awesome-mcp-servers`) | A list, not a tool. A place to look; anything found there comes through this page first. |
| **Awesome Claude skills** (`ComposioHQ/awesome-claude-skills`) | A list, not a tool. A place to look; anything found there comes through this page first. |
| **System prompts collection** (`x1xhlol/system-prompts-and-models-of-ai-tools`) | Other companies' system prompts, collected without a licence. Not something a public church project should build on. |

## Moving an existing setup across

1. Install Caveman and Ponytail (two prompts each, above).
2. Add any recommended tool you want, one at a time, and start a new session
   after each so you can see what it changed. Run `git status` after each
   one too: nothing in this repository should have changed (rule 6).
3. If you already use one of the left-out tools on other projects, turn it off
   for this one. Claude Code plugins can be disabled per project in
   `.claude/settings.local.json`, which is never committed.
4. Run `npm run verify` once. None of these tools is needed for it to pass.
