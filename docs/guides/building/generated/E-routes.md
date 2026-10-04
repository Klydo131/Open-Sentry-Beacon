# Appendix E. Every address in the app

Each page under `app/`, the address it answers, and who may open it. `allow` is the list the page passes to its shell; a person outside it is sent to their own home.

| Address | File | Who may open it |
|---|---|---|
| `/admin` | `app/admin/page.tsx` | Director, Executive Director |
| `/apps` | `app/apps/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/cases` | `app/cases/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/church` | `app/church/page.tsx` | Executive Director, Director, Guide, Explorer; Executive Director, Director, Guide, Explorer |
| `/dm/:id` | `app/dm/[id]/page.tsx` | Guide |
| `/dm` | `app/dm/page.tsx` | Guide |
| `/ds` | `app/ds/page.tsx` | Explorer |
| `/guilds` | `app/guilds/page.tsx` | Guide, Explorer |
| `/join` | `app/join/page.tsx` | Anyone (no shell gate on this page) |
| `/library` | `app/library/page.tsx` | Anyone (no shell gate on this page) |
| `/login` | `app/login/page.tsx` | Anyone (no shell gate on this page) |
| `/mail` | `app/mail/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/menu` | `app/menu/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/music` | `app/music/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/office` | `app/office/page.tsx` | Executive Director, Director, Guide |
| `/` | `app/page.tsx` | Anyone (no shell gate on this page) |
| `/password` | `app/password/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/policy` | `app/policy/page.tsx` | Anyone (no shell gate on this page) |
| `/privacy` | `app/privacy/page.tsx` | Anyone (no shell gate on this page) |
| `/profile` | `app/profile/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/publish` | `app/publish/page.tsx` | Anyone (no shell gate on this page) |
| `/sabbath` | `app/sabbath/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/settings` | `app/settings/page.tsx` | Executive Director, Director, Guide, Explorer |
| `/setup` | `app/setup/page.tsx` | Anyone (no shell gate on this page) |
| `/signup` | `app/signup/page.tsx` | Anyone (no shell gate on this page) |
| `/study` | `app/study/page.tsx` | Explorer |
| `/talk` | `app/talk/page.tsx` | Explorer, Guide |
