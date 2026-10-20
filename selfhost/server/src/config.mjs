// Everything the Beacon server reads from its environment, checked once at
// start-up. A missing or weak setting stops the server with a sentence saying
// which one, rather than starting and failing at the first sign-in.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = process.env.BEACON_REPO_ROOT || path.resolve(here, '../../..');

function list(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function seconds(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Read the configuration. `needs` names the settings this command cannot run without. */
export function readConfig(env = process.env, needs = ['database', 'keys', 'site']) {
  const problems = [];
  const cfg = {
    databaseUrl: env.DATABASE_URL || '',
    jwtSecret: env.JWT_SECRET || '',
    anonKey: env.ANON_KEY || '',
    serviceKey: env.SERVICE_ROLE_KEY || '',
    publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 8000}`).replace(/\/+$/, ''),
    siteUrl: (env.SITE_URL || '').replace(/\/+$/, ''),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    postgrestUrl: (env.POSTGREST_URL || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    port: Number(env.PORT) || 8000,
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || path.join(REPO_ROOT, 'selfhost/data')),
    jwtExpiry: seconds(env.JWT_EXPIRY, 3600),
    // Closed unless switched on. No screen in the app signs anybody up: people
    // arrive by invitation, so an open door here would only be a way round it.
    signupEnabled: flag(env.ENABLE_SIGNUP, false),
    autoconfirm: flag(env.MAILER_AUTOCONFIRM, false),
    passwordMinLength: Math.max(8, Number(env.PASSWORD_MIN_LENGTH) || 10),
    trustProxy: flag(env.TRUST_PROXY, false),
    smtp: {
      url: env.SMTP_URL || '',
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || '',
      fromName: env.SMTP_FROM_NAME || 'Hope Beacon',
    },
    inviteExpiry: seconds(env.INVITE_LINK_EXPIRY, 86400),
    recoveryExpiry: seconds(env.RECOVERY_LINK_EXPIRY, 3600),
    jobs: flag(env.RUN_JOBS, true),
    env,
  };

  if (needs.includes('database') && !cfg.databaseUrl) {
    problems.push('DATABASE_URL is not set. It is the connection string of the database owner.');
  }
  if (needs.includes('keys')) {
    if (cfg.jwtSecret.length < 32) {
      problems.push('JWT_SECRET must be at least 32 characters. `npm run keys` makes one.');
    }
    if (!cfg.anonKey || !cfg.serviceKey) {
      problems.push('ANON_KEY and SERVICE_ROLE_KEY are not set. `npm run keys` makes both from JWT_SECRET.');
    }
  }
  if (needs.includes('site') && !/^https?:\/\//.test(cfg.siteUrl)) {
    problems.push('SITE_URL must be the address of your app, such as https://beacon.example.org. E-mailed links go there.');
  }
  if (problems.length) {
    const err = new Error(`The Beacon server cannot start:\n  - ${problems.join('\n  - ')}`);
    err.code = 'BEACON_CONFIG';
    throw err;
  }
  if (cfg.allowedOrigins.length === 0 && cfg.siteUrl) cfg.allowedOrigins = [new URL(cfg.siteUrl).origin];
  return cfg;
}
