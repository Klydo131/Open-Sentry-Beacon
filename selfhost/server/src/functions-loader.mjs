// Lets Node load the repository's Supabase functions unchanged. They import
// their libraries the way Deno does ("jsr:…", "npm:…"); this maps each one to
// the copy installed beside this server. Only the names below: a function
// that starts importing something new fails to load with that name, rather
// than running against whatever happens to be installed.

export const PROVIDES = {
  'jsr:@supabase/supabase-js@2': '@supabase/supabase-js',
  'npm:web-push@3.6.7': 'web-push',
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(PROVIDES, specifier)) {
    return nextResolve(PROVIDES[specifier], { ...context, parentURL: import.meta.url });
  }
  if (/^(jsr|npm|https?):/.test(specifier)) {
    throw new Error(`A function imports "${specifier}", which the Postgres edition does not provide. Add it to selfhost/server/src/functions-loader.mjs and package.json.`);
  }
  return nextResolve(specifier, context);
}

// The functions are TypeScript modules, as Deno reads them. Said here, so Node
// does not have to guess from a package.json the functions folder never had.
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts') && url.includes('/supabase/functions/')) {
    return nextLoad(url, { ...context, format: 'module-typescript' });
  }
  return nextLoad(url, context);
}
