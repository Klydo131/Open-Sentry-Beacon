// Turn a YouTube or Facebook video link into an embeddable player URL.
//
// No SDK, no API key, no dependency: both platforms expose a plain iframe
// endpoint and that is the entire integration. We never download, re-host or
// proxy the video — the person's browser talks to YouTube/Facebook directly,
// exactly as it would in a normal tab. That keeps this free and keeps us on the
// right side of both platforms' terms, which forbid re-hosting their video.

const YT_ID = /^[\w-]{11}$/;

function bareHost(u: URL): string {
  return u.hostname.replace(/^(www|m)\./, '');
}

function youtubeId(u: URL): string | null {
  const host = bareHost(u);
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return YT_ID.test(id) ? id : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = u.searchParams.get('v');
  if (v && YT_ID.test(v)) return v;
  const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname);
  return m ? m[1] : null;
}

function isFacebookVideo(u: URL): boolean {
  const host = bareHost(u);
  if (host === 'fb.watch') return true;
  if (host !== 'facebook.com') return false;
  return /\/videos?\//.test(u.pathname) ||
    /^\/(watch|reel)\b/.test(u.pathname) ||
    u.searchParams.has('v');
}

export interface VideoEmbed {
  kind: 'youtube' | 'facebook';
  src: string;
  label: string;
}

export function videoEmbed(raw?: string | null): VideoEmbed | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const yt = youtubeId(u);
  if (yt) {
    // youtube-nocookie.com: YouTube sets no tracking cookie until the video is
    // actually played. rel=0 keeps the end screen to the same channel rather
    // than throwing up a wall of unrelated recommendations — this is a study
    // room, not a feed.
    return {
      kind: 'youtube',
      src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`,
      label: 'YouTube',
    };
  }

  if (isFacebookVideo(u)) {
    return {
      kind: 'facebook',
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
        u.toString(),
      )}&show_text=false`,
      label: 'Facebook',
    };
  }

  return null;
}
