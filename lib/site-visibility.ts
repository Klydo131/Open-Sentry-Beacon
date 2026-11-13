// Is this deployment allowed to appear in search results?
//
// THE PROBLEM THIS SOLVES. Being findable was previously refused in three
// separate places — the `robots` metadata in app/layout.tsx, app/robots.ts, and
// the X-Robots-Tag header in next.config.mjs — each carrying a comment saying
// "change all three, or none". That instruction is correct and it is also the
// kind of instruction people follow twice out of three times. A half-change is
// the worst outcome available: a site that is indexed while everyone involved
// believes it is not, or a showcase nobody can find because one of the three
// was missed.
//
// So it became one switch. Set BEACON_PUBLIC_SITE=1 and all three agree.
//
// THE DEFAULT IS STILL NO, AND THAT IS DELIBERATE. This repository is meant to
// be forked and deployed by a church. Such a deployment holds real people's
// names and conversations, and a shared deep link that gets indexed is the
// cheapest possible leak. Being findable is opted into on purpose; it is never
// arrived at by forgetting something.
//
// The showcase deployment of this project is the case that SHOULD say yes: it
// has no real people in it, and a public demo nobody can search for is not
// doing its job. That is one environment variable on one deployment.
//
// Read on the server only (metadata and headers are both server-side), so this
// is a plain env var rather than a NEXT_PUBLIC_ one — nothing about it needs to
// reach the browser bundle.
export const INDEXABLE = process.env.BEACON_PUBLIC_SITE === '1';
