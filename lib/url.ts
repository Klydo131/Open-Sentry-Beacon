// Only allow http(s) links to become clickable. A material's external_url is
// entered by an admin/DM; without this guard a value like "javascript:…" would
// render as an href and run on click (stored XSS). Anything that isn't an
// absolute http/https URL returns null and is shown as plain, non-clickable text.
/**
 * Parse a URL and decide whether it may ever be put in an href.
 *
 * The single place that decision is made. Two rules, and the second is the one
 * a regular expression cannot express:
 *
 *   1. http and https only. `javascript:`, `data:` and `vbscript:` are all
 *      valid URLs and all execute on click.
 *
 *   2. NO USER INFO. `https://adventist.org@evil.example/give` is a valid URL
 *      that goes to evil.example — everything before the @ is user info the
 *      browser ignores, while a human reads the trustworthy name on the left.
 *      The old regex here, `^https?:\/\/\S+$`, matched it happily.
 *
 *      That mattered: this guard sits on lesson links and material URLs in
 *      thirteen places, all of them tapped by an Explorer, and all of them
 *      entered by a Guide or a Director. A Guide misusing their position
 *      towards the person they walk with is the exact thing this app's reports
 *      and trial room exist for, so a deceptive link is inside the threat
 *      model, not outside it.
 */
export function parseSafeHttpUrl(url?: string | null): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function safeExternalUrl(url?: string | null): string | null {
  // The ORIGINAL string is returned rather than the parsed one, so nothing
  // somebody typed is silently rewritten on screen. The parse is the check;
  // the text stays theirs.
  return parseSafeHttpUrl(url) ? (url as string).trim() : null;
}

// The same question for a link that may legitimately be INTERNAL.
//
// `safeExternalUrl` above demands an absolute http(s) URL, which is right for a
// material somebody typed in and wrong for the mailbox: the call-to-action in a
// simulated email is normally a path in this same app ('/join?token=…'), and
// running it through the stricter guard would refuse every real link while
// letting no attack through. So this one accepts two shapes and nothing else:
//
//   1. A path rooted at this origin — '/join?token=abc'.
//   2. An absolute http(s) URL, delegated to safeExternalUrl.
//
// The case worth naming is '//evil.example/x'. It LOOKS like a path, it starts
// with a slash, and a browser reads it as another origin entirely. It is
// rejected here explicitly rather than left to a reader to notice.
//
// Everything else — 'javascript:', 'data:', 'vbscript:', a bare word — returns
// null, and the caller renders plain text instead of a link.
export function safeLinkHref(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return null; // protocol-relative: another site
  if (trimmed.startsWith('/')) return trimmed;
  return safeExternalUrl(trimmed);
}
