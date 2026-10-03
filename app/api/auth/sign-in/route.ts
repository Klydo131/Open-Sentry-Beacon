import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

type PendingCookie = { name: string; value: string; options: CookieOptions };

const roles = new Set<Role>(['executive', 'admin', 'dm', 'ds']);

/** Shown when the sign-in service is turning attempts away for a while. */
const TOO_MANY = 'Too many sign-in attempts just now. Wait a few minutes, then try again.';
const homeForRole: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

function withSession(
  next: NextResponse,
  cookies: PendingCookie[] = [],
  authHeaders: Record<string, string> = {},
) {
  Object.entries(authHeaders).forEach(([name, value]) => next.headers.set(name, value));
  next.headers.set('Cache-Control', 'private, no-store, max-age=0');
  next.headers.set('Pragma', 'no-cache');
  cookies.forEach(({ name, value, options }) => next.cookies.set(name, value, options));
  return next;
}

function jsonResponse(
  body: object,
  status: number,
  cookies: PendingCookie[] = [],
  authHeaders: Record<string, string> = {},
) {
  return withSession(NextResponse.json(body, { status }), cookies, authHeaders);
}

function formRedirect(
  request: NextRequest,
  path: string,
  cookies: PendingCookie[] = [],
  authHeaders: Record<string, string> = {},
) {
  return withSession(
    NextResponse.redirect(new URL(path, request.url), 303),
    cookies,
    authHeaders,
  );
}

export async function POST(request: NextRequest) {
  // A cross-site form must not be able to sign a visitor into somebody else's
  // account. Browsers send Origin on this same-origin POST; non-browser clients may
  // omit it, so absence is allowed while a different origin is not.
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return jsonResponse({ error: 'Sign-in request was refused.' }, 403);
  }

  const expectsJson = request.headers.get('content-type')?.includes('application/json') ?? false;
  const input = expectsJson
    ? await request.json().catch(() => null)
    : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!email || email.length > 254 || !password || password.length > 1024) {
    return expectsJson
      ? jsonResponse({ error: 'Enter your e-mail and password.' }, 400)
      : formRedirect(request, '/login?error=missing');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return expectsJson
      ? jsonResponse({ error: 'Live sign-in is not configured.' }, 503)
      : formRedirect(request, '/login?error=unavailable');
  }

  let pendingCookies: PendingCookie[] = [];
  let pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        pendingCookies = cookiesToSet;
        pendingHeaders = { ...pendingHeaders, ...headers };
      },
    },
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    // TOO MANY TRIES IS NOT A WRONG PASSWORD (the audit of 3 October 2026).
    // The sign-in service limits attempts, and because this route is what
    // reaches it, everybody signing in at once can be held back together.
    // Telling them their password is wrong sends them to reset a password
    // that was right; telling them to wait is the truth. It says nothing about
    // whether the address has an account, so it gives nobody a list.
    if (authError?.status === 429) {
      return expectsJson
        ? jsonResponse({ error: TOO_MANY }, 429, pendingCookies, pendingHeaders)
        : formRedirect(request, '/login?error=busy', pendingCookies, pendingHeaders);
    }
    if (authError || !authData.user || !authData.session) {
      // Keep unknown addresses and wrong passwords indistinguishable. An
      // invitation-only church directory must not become enumerable.
      return expectsJson
        ? jsonResponse(
            { error: 'That email and password did not match.' },
            401,
            pendingCookies,
            pendingHeaders,
          )
        : formRedirect(request, '/login?error=credentials', pendingCookies, pendingHeaders);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_approved')
      .eq('id', authData.user.id)
      .single();
    if (profileError || !profile || !roles.has(profile.role as Role)) {
      return expectsJson
        ? jsonResponse(
            { error: 'Your account profile is not ready yet.' },
            409,
            pendingCookies,
            pendingHeaders,
          )
        : formRedirect(request, '/login?error=profile', pendingCookies, pendingHeaders);
    }

    const result = {
      profile: {
        role: profile.role as Role,
        is_approved: Boolean(profile.is_approved),
      },
      session: authData.session,
    };
    return expectsJson
      ? jsonResponse(result, 200, pendingCookies, pendingHeaders)
      : formRedirect(
          request,
          result.profile.is_approved ? homeForRole[result.profile.role] : '/login',
          pendingCookies,
          pendingHeaders,
        );
  } catch {
    return expectsJson
      ? jsonResponse(
          { error: 'Could not reach live sign-in. Please try again.' },
          503,
          pendingCookies,
          pendingHeaders,
        )
      : formRedirect(
          request,
          '/login?error=unavailable',
          pendingCookies,
          pendingHeaders,
        );
  }
}
