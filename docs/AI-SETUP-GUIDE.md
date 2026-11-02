# Setting up Hope Beacon with an AI assistant

**For IT people who would rather describe the job than type it.**

Everything in [START-HERE.md](START-HERE.md) can be handed to an AI assistant.
This document is about doing that *well*, because the ways it goes wrong are
specific and predictable.

Read [START-HERE.md](START-HERE.md) first — this assumes you know what is being
set up and why.

---

You can hand most of this document to an AI assistant and have it do the typing.
This section is about doing that *well*, because the failure modes are specific.

### What to use

Any of Claude, ChatGPT, Gemini, GitHub Copilot, Cursor. The free tiers are
enough for setup. There is a longer list in [AI-TOOLKIT.md](AI-TOOLKIT.md).

### The one thing that matters most

**Give it the repository, not a description of the repository.**

An AI that has read `supabase/migrations/0001_core_schema.sql` knows your exact
security rules. One that has only been told "it's a church app with Supabase"
will invent a plausible schema that does not match yours, and everything it
writes afterwards will be subtly wrong in a way that is hard to see.

Tools like Claude Code, Cursor and Copilot Workspace read the actual files. Use
one of those if you can. If you are using a chat window, paste the real file.

### Prompts that work

**Setting up:**

> I am setting up Open Sentry Beacon from my fork, `github.com/<your-account>/Open-Sentry-Beacon`.
> Read `docs/START-HERE.md` and `docs/SETUP.md`. I am on Part 3 Step 3 and the
> SQL editor returned this error: `<paste the exact error>`. What went wrong and
> what do I run instead?

**Making a change:**

> In this repository, I want Explorers to be able to mark a lesson as finished.
> Before writing anything: read `supabase/migrations/0012_lessons_and_notifications.sql`
> and `lib/live/data.ts`, and tell me which files you would change and why.
> Do not write code yet.

That last sentence is the important one. Ask for the plan first. It takes ten
seconds to read a plan and a long time to unpick a confident wrong change.

**Understanding something:**

> Explain what `supabase/migrations/0003_invite_approval_gate.sql` does, in
> plain English, as if I do not know SQL. What could go wrong if I removed it?

### The rules, and they are not optional

**Never paste a key into a chat window.** Not the service_role key, not the
Brevo key, not your database password. Say `<my API key>` instead. If you have
already pasted one, go and rotate it now — it is a button in the same place you
created it.

**Make it show you, not tell you.** "Did that work?" gets you a cheerful yes.
"Run the query that proves it and show me the output" gets you the truth. This
document exists partly because an AI reported a fixed invitation system twice
before anyone clicked a link.

**Ask for the negative test.** If it says a security rule works, ask it to prove
the rule *blocks* what it should block. A test where nothing fails has proved
nothing. Every security fix in this project is checked that way, and the reason
is that a test suite once passed while refusing four things for a completely
unrelated reason.

**It will be confidently wrong sometimes.** Not occasionally — regularly, and
most convincingly on the things it half-knows. Check anything that touches money,
security, or somebody's private conversation.

---

---

## A working session, start to finish

Copy this into an assistant that can read files (Claude Code, Cursor, Copilot
Workspace), one message at a time. Wait for each answer.

**1. Orient it**

> Clone my fork, `https://github.com/<your-account>/Open-Sentry-Beacon`, and read
> `docs/START-HERE.md`, `docs/SETUP.md`, and every file in
> `supabase/migrations/`. Then tell me, in your own words, what this app does,
> what the four services are for, and what order I have to do things in. Do not
> change anything yet.

If the summary is wrong, stop. Everything after this depends on it.

**2. Get it running locally**

> Get the app running on my machine with no database, the way the README
> describes. Tell me the exact commands and what I should see.

**3. The database**

> I have created a Supabase project. Walk me through applying every migration
> in `supabase/migrations/` in order. For each file, tell me in one line what it
> adds, so I know what I am running. Warn me about anything irreversible.

**4. Prove the security rules — do not skip this**

> Write me SQL that proves a Guide cannot read another Guide's Explorer.
> Include a positive control: a query that SHOULD succeed, so that if the
> permission check is broken in the other direction I will see it. Show me the
> output of both.

A test where nothing fails has proved nothing. This is the single most valuable
thing an assistant can do for you here.

**5. Email**

> Read `docs/EMAIL.md`. Supabase's built-in mailer sends two messages an hour
> for the whole project and that cannot be raised. Tell me whether my church
> needs an SMTP provider, and if so give me the exact dashboard steps for
> Brevo — including the IP-blocking setting, which applies to SMTP as well as
> to API keys. I will paste every credential myself. Do not ask me for a key
> and do not put one in a file.

**6. Deploy**

> Walk me through deploying to Vercel and tell me exactly which environment
> variables to set. Then tell me how to verify the deployment actually works,
> as a test I run rather than a thing you assert.

**7. Make it prove the deployment, not describe it**

> Give me a numbered list of things I click, on my phone, on mobile data with
> wifi off, that would show this deployment is genuinely working — including at
> least one that should FAIL, so I know the checks mean something. Do not tell
> me it works; tell me how I would find out that it does not.

---

## Prompts worth keeping

Not a session — individual jobs, for when something is already running. Each one
is written the way that actually gets a useful answer: it names the files, says
what "done" looks like, and asks for evidence rather than assurance.

### Diagnosing a failure

> Invitations stopped arriving. Do not guess. Query the Supabase auth logs,
> group the last 24 hours by hour and by status, and tell me the actual reason
> with the log lines that show it. If the answer is a rate limit, tell me the
> measured number rather than the documented one.

> This error appeared: `<paste the exact text>`. Before proposing a fix, tell me
> what state the system must be in for that message to be produced. Then tell me
> how to check whether it is in that state.

### Changing the app safely

> I want `<change>`. Before writing any code, tell me which files it touches,
> what could break that I would not notice, and which existing test would catch
> a mistake. Then wait for me.

> Read `tests/` and tell me which of my behaviours are actually covered and
> which only look covered. I want the list of things that would pass while
> broken.

### Making it your church's own

> Change every place the app says "Guide" and "Explorer" to `<our words>`.
> Find them all — including the tutorial, the emails and the policy page — and
> show me the list before you change anything.

> Rewrite `app/policy/page.tsx` to match our church's safeguarding policy,
> which is: `<paste yours>`. Keep the reading level and the structure. Do not
> add clause numbers or legal phrasing. Keep the emergency-services line first.

### Reviewing what the assistant just did

> Read back the diff you just made and argue against it. What did you assume
> that I did not tell you? What would a reviewer object to? What did you not
> test?

> You said this is fixed. Show me the command I run and the output I should
> see. If you have not run it, say so plainly instead of describing what would
> happen.

### The prompt to use when you are stuck and frustrated

> Stop proposing fixes. Write down, in order, what you actually know to be
> true from evidence you have seen this session, and separately what you are
> assuming. Then tell me which single assumption, if wrong, would explain
> everything.

---

## Things to watch for

**"It's working now."** Ask how it knows. This project's own history has a fixed
invitation system reported as fixed twice, while every link it produced still
failed on arrival, because nobody clicked one.

**Confident SQL against a schema it has not read.** If it did not open
`0001_core_schema.sql`, its column names are guesses that will look right.

**Security rules edited to make an error go away.** "Permission denied" usually
means the rules work. Weakening them to clear the error is how a church's
private conversations end up readable by anyone holding a key that ships in
every visitor's browser.

**Any request for a secret.** No assistant needs your `service_role` key, your
Brevo key, or your database password. If one asks, say no and paste
`<my key>` instead.

---

## If you do not have an AI assistant

Everything here can be done by hand. Part 7 of
[START-HERE.md](START-HERE.md) is the manual path with every command, and Part 8
is the same journey for someone who has never opened a terminal.
