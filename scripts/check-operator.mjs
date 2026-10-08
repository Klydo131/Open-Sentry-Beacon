// Fictional previews need no operator identity. Live builds must publish real facts.
import { pathToFileURL } from 'node:url';
export function missingOperatorFacts(env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];
  return ['NEXT_PUBLIC_BEACON_CONTROLLER', 'NEXT_PUBLIC_BEACON_PRIVACY_CONTACT',
    'NEXT_PUBLIC_BEACON_HOSTING_DETAILS'].filter(key => !env[key]?.trim());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {default: nextEnv} = await import('@next/env');
  nextEnv.loadEnvConfig(process.cwd());
  const missing = missingOperatorFacts(process.env);
  if (missing.length) {
    console.error('Complete the public operator privacy facts before building a live app:\n' + missing.join('\n'));
    process.exit(1);
  }
}
