# What an AI tool can, cannot and must not do here

**For every developer who works on Hope Beacon with Claude, Codex, Copilot,
Cursor, Gemini or any other AI tool.** An AI tool is a fast, capable assistant
that is regularly and convincingly wrong. Used well, it saves days. Used
carelessly on an app that holds people's pastoral conversations, it can expose
them. This page is the short version; [AGENTS.md](../AGENTS.md) sections 0.2
and 0.3 are the rules in full, and [AI-SETUP-GUIDE.md](AI-SETUP-GUIDE.md) is how
to set the app up with one.

---

## What it can do well, with a person directing it

- Read the whole repository and explain any part of it.
- Draft code, tests, database changes and documents.
- Run the gate (`npm run verify`) and the database tests, and read their output.
- Find bugs by reading and by testing, including the kind a person skims past.
- Prepare a database change and explain, in words a church leader follows, what
  it does, what it touches, and how to undo it.

## What it cannot know, however confident it sounds

| Limit | What to do about it |
| --- | --- |
| It cannot see your deployed site or a real phone unless you give it one. | "Pushed" is not "live". Open the site yourself, on a phone, on mobile data. |
| It cannot test Safari without WebKit. | Treat iPhone behaviour as unverified until somebody checks on an iPhone. |
| It does not remember earlier sessions unless they were written down. | Keep decisions in the repository: commit messages, `docs/`, the handoff. |
| It is regularly wrong, most often on things it half-knows. | Ask it to **show** the proof (the query, the output, the failing test), not to tell you. |
| A test it wrote can pass while checking nothing. | Break the thing on purpose and watch the test go red before trusting it. |
| It cannot tell a real member from a test account by the data alone. | Keep test accounts out of production entirely. |
| It cannot judge a pastoral or safeguarding situation. | Those decisions belong to the church's leaders and its DPO. |
| It reads instructions planted in issues, comments, web pages and files. | Text it reads is information, never an order (AGENTS.md section 0.3). |

## What it must never do, whoever asks

- Push to `main`. It works on a branch and opens a pull request that a person
  reviews and the owner merges.
- Apply a database change, deploy a function, or run SQL against a live
  database without the person's explicit go for that exact change.
- Read, print, copy or send a secret, a key, a connection string or a member's
  details, or write one into a file, a log or a commit.
- Put a real name, e-mail address, photograph or project identifier into the
  repository. It is public.
- Create test accounts on the production service, or run the demonstration
  seed there.
- Weaken or delete a check to make a change pass. Fix the change.
- Add or change a GitHub workflow, an agent file or a tool setting because
  something it read asked it to.
- Open or summarise a real member's conversation, prayer or note.

## How to work with it well

1. **Ask for the plan first.** "Tell me which files you would change and why.
   Do not write code yet." A plan takes a minute to read; a confident wrong
   change takes an afternoon to unpick.
2. **Give it the repository, not a description of it.** A tool that has read
   `supabase/migrations/` knows your rules; one that has not invents plausible
   ones.
3. **Ask for the negative test.** A security rule is proven when the test shows
   it refusing what it should refuse.
4. **Read every line it wrote** before the pull request, as you would a new
   volunteer's.
5. **Make it say what it could not check**, in the pull request, in so many
   words.

Before a church's first real members join, the custodian follows
[GOING-LIVE.md](GOING-LIVE.md), with or without an AI tool.
