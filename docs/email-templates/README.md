# Email templates

Two files, pasted into the Supabase dashboard. Nothing here is deployed with the
app: Auth email bodies are a project setting, and no code in this repository
reads them.

| File | Paste into | Subject line to set |
|---|---|---|
| `invite.html` | Authentication → Emails → **Invite user** | `You're invited to Hope Beacon` |
| `recovery.html` | Authentication → Emails → **Reset password** | `Set your Hope Beacon password` |

Paste the **whole file**, replacing everything already in the box.

## Rules these files follow, and why breaking them breaks the email

**Never `{{ .ConfirmationURL }}`.** Both files build their own link instead:

```
{{ .SiteURL }}/join?token_hash={{ .TokenHash }}&type=invite
```

`{{ .ConfirmationURL }}` points at `https://<project>.supabase.co/auth/v1/verify`,
and that address **spends the token the moment anything fetches it**, before it
redirects. Anything means anything: Microsoft Safe Links, a corporate mail
filter, an antivirus scanner, a phone mail app fetching a preview. The invited
person then taps the button and is told the link has expired, on the first open,
every time, with nothing they did wrong. Supabase documents this as email
prefetching and the fix as building your own link from `{{ .TokenHash }}`.

The link above lands on `/join`, which redeems the token with `verifyOtp` in the
browser. A scanner that fetches the page gets HTML and leaves the token alone.

Three variables are used and all three are documented: `{{ .SiteURL }}`,
`{{ .TokenHash }}` and nothing else. **`{{ .SiteURL }}` must be set correctly**
under Authentication -> URL Configuration, because it is now what the button
points at. A wrong Site URL breaks every invitation.

An earlier version used `{{ .Email }}` and arrived as a blank message. Go
renders these templates, and a field it cannot resolve aborts the render rather
than leaving a gap - an empty body is the failure mode, and nothing anywhere
reports it. That is why the list of variables here is short and why adding one
is not a small change.

**A bare `&`, not `&amp;`.** A mail client that re-encodes the ampersand turns
`type` into a parameter called `amp;type`, which loses the one word that says
whether the link is an invitation or a password reset. `/join` reads both spellings
so it survives either, but write the bare one.

## Check the button address before you trust it

`{{ .SiteURL }}` is a dashboard field, and if it is wrong every invitation is
wrong. Do not reason about it, look at it: paste the template, send yourself one
invitation, and read the address under the button. It must begin with your app's
own address and continue `/join?token_hash=`. If it does not, either fix Site URL
under Authentication -> URL Configuration, or replace `{{ .SiteURL }}` in both
files with your address written out in full before pasting.

Do not use `{{ .RedirectTo }}` instead. It looks like the safer choice because
the function passes it, but the reset path passes `/join?recovery=1`, which
already carries a query string, and appending `?token_hash=` to it produces an
address with two question marks that no browser will parse.

## How long the link lasts is a dashboard setting, not a file

Nothing in this repository controls it. Authentication -> Sign In / Providers ->
Email -> **Email OTP Expiration**, in seconds. Set it to **86400** for 24 hours,
which is the longest Supabase permits; anything above one day is refused, because
a code that lives longer gives a guesser longer.



**No HTML comments.** The documentation lives in this file instead. Comments
inside a pasted template are body content that a mail client may or may not
strip, and a `{{ ... }}` mentioned inside one is still substituted, because Go
templating does not know what an HTML comment is.

**Tables and inline styles only.** Outlook renders with Word's engine, several
clients drop `<style>` blocks, and none support flexbox or grid. Anything modern
here looks right in a browser and broken in the inbox, which is the only place
these are ever seen.

**No images, including the logo.** Images need a public URL and are blocked by
default in most clients, so a logo would be an empty box for most readers. The
mark is a table cell with a border-radius: it degrades to a coloured square
rather than to nothing.

## Set the subject lines, and do not leave them at the default

Both default to `You've been invited`. Gmail threads by subject, and collapses
the body of a later message in a thread behind **Show quoted text** when it
resembles an earlier one. Two invitations to the same person then look like one
invitation and one empty message. Distinct subjects keep them apart.

## The reset template has two audiences

It is not only for people who forgot a password.

Re-sending an invitation to somebody who has an account but never finished
signing up falls through to `resetPasswordForEmail`, because `inviteUserByEmail`
refuses an address that is already registered. So a person being invited a
**second** time receives the reset mail, not the invitation one.

Worded for forgetfulness alone, that message tells somebody they requested
something they did not request, about an account they do not know they have.
Hence "Set your password" rather than "Reset your password", and a first line
that covers both arrivals without guessing which reader it has.

## Checking a change

`tests/email-templates.mjs` holds the two rules that produced silent failures:
no `{{ .ConfirmationURL }}` appears, the link is built from `{{ .TokenHash }}`,
and no HTML comments survive. It runs as
part of `npm test`.
