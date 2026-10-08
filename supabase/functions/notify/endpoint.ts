// Browser push services only: subscriptions must never choose our server's destination.
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    const host = url.hostname;
    return host === 'fcm.googleapis.com'
      || host === 'updates.push.services.mozilla.com'
      || host === 'push.services.mozilla.com'
      || host === 'updates-push.services.mozaws.net'
      || host.endsWith('.push.apple.com')
      || host.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}
