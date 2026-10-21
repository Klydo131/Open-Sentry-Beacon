# Email

**Nothing to set up.** Hope Beacon sends its invitations through Supabase's own
email service, which every Supabase project has. No account with a third party,
no API key to store, no sender address to verify. Clone this project, run the
migrations, and invitations work.

> **Read this before your first busy day.** The built-in service sends **two
> messages an hour for the entire project**. That is fine for a church inviting
> one person at a time and will quietly strand you if you sit down to invite
> ten. [Connecting an SMTP provider](#adding-a-provider--sooner-than-eventually-if-you-invite-in-batches)
> is a dashboard form, takes about five minutes, and raises it to thirty an
> hour.

---

## How an invitation is actually sent

`supabase/functions/invite/index.ts` runs on your own Supabase project and does
two things depending on whether the person already has an account:

| Situation | What is sent |
|---|---|
| A new address | `inviteUserByEmail` — creates the account and sends "you have been invited" |
| Someone who never finished joining | `resetPasswordForEmail` — sends "set a password" |

Both messages link to `/join`, which is the screen that finishes the sign-up
either way. Pressing **Re-send** on a waiting invitation mints a fresh link and
posts it again, with nothing to retype.

## What this costs you

Being honest about the trade, because it matters at a certain size:

- **The wording is Supabase's, not your church's.** The message comes from your
  project's Auth email template. You can rewrite that template in the Supabase
  dashboard under **Authentication → Email Templates** and it will say whatever
  you like.
- **It sends two messages an hour. For the whole church.** Not per person —
  two, in total, per project, per hour. This number is measured, not estimated:
  the auth log of a real church shows at most two successes in any hour and
  `over_email_send_rate_limit` on everything after.
- **And one message per address per minute**, separately from the above.

### What that means on the day you actually invite people

If your Director invites four people in one sitting, **two of those invitations
are never sent.** The screen used to show the provider's raw refusal, which
reads like a fault; it now says plainly that the hour's email is spent and hands
over the join link for the person in front of you.

**This limit cannot be raised while the built-in mailer is in use.** It is not a
setting in your dashboard. The only way to send more is to connect an email
provider, below — which is why the section under it exists.

### Telling the two refusals apart

Both come back as HTTP 429 and they mean different things:

| What you see | What it is | What to do |
|---|---|---|
| *"wait N seconds"* | One per address per minute. The first message **was** accepted. | Wait, press Send once. |
| *"used up its email for the hour"* | The project's two-an-hour quota is spent. **Nothing was sent.** | Send the link on screen by hand, or connect a provider. |

## Why not a third-party provider by default

This project used to post invitations to Brevo, and it cost a full day of a
church's time in a way worth recording.

Everything was configured correctly. The API key, the verified sender and the
site URL were all present and all loaded — the function's own log confirmed it
on every attempt. Every call was refused anyway, because the Brevo account had
its **IP allow-list** switched on, and Supabase Edge Functions have no fixed IP
address to add to it. Two consecutive attempts were rejected from two different
servers. Invitations silently stopped because of a setting in a third party's
dashboard that could not be seen from inside the app.

None of that can happen with Supabase's own mailer. It is sent by Supabase, from
inside Supabase.

**But note what the lesson actually was.** It was not "Brevo is bad" — it was
that a security toggle in a third party's dashboard could stop every invitation
with no sign of it inside this app. Brevo is a perfectly good way to send this
church's email, over SMTP, once that toggle is off. What changed is that the
app now *names* the cause when it happens, instead of showing the raw refusal.

## Adding a provider — sooner than "eventually", if you invite in batches

Two an hour is enough for a church adding one person after a Sabbath
conversation. It is not enough for a launch, a training weekend, or a
demonstration. If you have more than two people to invite in an hour, you need
this section, and the good news is that it is a dashboard form rather than code.

### The easy way: custom SMTP (no code at all)

Supabase's own Auth service will use your provider's SMTP server if you give it
one, under **Project Settings → Authentication → SMTP Settings**. Everything in
this app keeps working exactly as it does now — same function, same templates,
same links, no key stored anywhere in this project — and the default quota rises
from two an hour to **thirty new users an hour**, itself configurable under
**Authentication → Rate Limits**.

You need four things from your provider, which every dashboard calls "SMTP
credentials": host, port, username, password. Plus a **sender address the
provider has verified as yours** — most refuse to send from one they have not,
and the error rarely says so plainly.

#### Brevo, specifically — and the correction that matters

An earlier version of this page said the IP allow-list "was on the API-key path"
and that whether it also covered SMTP was untested. **It covers SMTP.** Brevo's
own documentation says the authorized-IP list is shared across API keys and SMTP
keys, and an unrecognised address gets `525 5.7.1 Unauthorized IP address`.

So the thing that broke invitations here breaks the SMTP route too, and there is
one way out of it:

> **Switch the blocking off. Do not add an address to the list.**
>
> The connection is made by your mail service's servers, not by the computer
> the Director is sitting at, and those addresses change between sends. Adding
> your own IP authorises the one machine that never connects.
>
> **Settings → Security → Authorized IPs → Deactivate blocking.**

Then, still in Brevo: **Transactional → Settings → SMTP relay → Generate a new
SMTP key**. Copy the login (it looks like `something@smtp-brevo.com`) and the
key. **An SMTP key is not an API key** — the API key will not authenticate here.

Into Supabase:

| Field | Value |
|---|---|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | the SMTP login, `…@smtp-brevo.com` |
| Password | the SMTP **key** |
| Sender email | an address verified in Brevo |
| Sender name | your church's name |

Last, raise the quota that was the whole problem: **Authentication → Rate
Limits → emails sent per hour**, up from 2.

If invitations stop again after this, the Director now sees which of the four
causes it was in plain words rather than the provider's raw text — including
"that is IP blocking, and it has to be turned off".

#### Resend, if you prefer it

Resend works the same way and is written down here because it keeps being asked
about. It is SMTP into the same Supabase box, so nothing in the app changes.

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` — the literal word, not your email |
| Password | an API key created in Resend, beginning `re_` |
| Sender email | an address on a domain you have verified in Resend |

Two differences from Brevo worth knowing before you choose:

- **Resend has no authorized-IP feature**, so the trap that cost a day with
  Brevo does not exist here.
- **Resend will not send from a shared address at all.** Brevo lets you verify
  a single sender like `you@gmail.com` and start immediately; Resend requires a
  domain you control, verified with DNS records, before it sends anything to
  anybody but yourself. If you do not own a domain yet, that decides it.

#### The DNS records, whichever provider you pick

Both want the same three things on the domain, and all three are TXT records
added at your registrar:

| Record | What it does | What happens without it |
|---|---|---|
| **SPF** | Says which servers may send as your domain | Gmail marks the mail as suspicious or bins it |
| **DKIM** | Signs each message so it cannot be tampered with | Same, and some providers refuse to send at all |
| **DMARC** | Tells other mail servers what to do when the first two fail | Nothing breaks, but delivery is weaker and you get no reports |

A reasonable first DMARC record is `v=DMARC1; p=none; rua=mailto:you@example`,
on the host `_dmarc`. `p=none` means "watch, do not reject", which is where you
want to start.

Give DNS an hour before deciding it has not worked. Most changes are live in
minutes; some registrars are slower, and re-adding a record you already added
is how people end up with two conflicting SPF lines, which is worse than none.

### The other way: post to a provider's API from the function

Only if you want your church's own wording in the message body rather than
Supabase's template. The send lives in **one place** — the block marked
`SEND IT` in `supabase/functions/invite/index.ts`. Replace those two calls with
a POST to your provider and nothing else in the app changes.

Whichever provider you choose:

- **Verify your sending address with them first.** Most refuse to send from an
  address they have not confirmed is yours, and the error rarely says so
  plainly.
- **Do not switch on an IP allow-list.** Edge Functions have no fixed address.
  This is the one that cost the day above.
- **Keep the key out of the browser.** It belongs in Edge Function secrets
  (**Edge Functions → Secrets**), or failing that in the `app_settings` table,
  which has row level security on with no policies and every grant revoked from
  `PUBLIC` — so only the service role can read it. Never in a
  `NEXT_PUBLIC_` variable.

## The court room's door code

A project can choose to open the court room with a code sent by email rather
than an authenticator app (`COURT_DOOR_METHOD = email`; see
[COURT-ROOM.md](./COURT-ROOM.md#choosing-email-for-the-door)). Those codes are
sent by `supabase/functions/door-code` through Brevo's API, with the same
`BREVO_API_KEY` and `BREVO_SENDER` as the invitations, read the same way
(**Edge Functions → Secrets** first, then `app_settings`). Without both, the
door says the project cannot send codes yet, and nothing is sent. Supabase's own
mailer is not used for these: its templates cannot carry a code the app made.

Each leader can be sent one code every 30 seconds and five an hour, which keeps
well inside Brevo's free 300 a day.

## When an invitation cannot be emailed

The Director gets the one-time link on screen with a **Copy link** button, and
the invitation stays open. The account is real and the link works; only the
postman is missing. Sending it by hand — WhatsApp, Messenger, in person — takes
the person through exactly the same sign-up.

That path is deliberate. An email service having a bad afternoon should not stop
a church inviting somebody standing in front of them.
