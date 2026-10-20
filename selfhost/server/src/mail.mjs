// E-mail for invitations and password resets, through your own SMTP account
// (Brevo, Mailgun, Postmark, Google Workspace, your host's own; any of them).
//
// The messages are the repository's own templates (docs/email-templates/),
// filled in the same way Supabase fills them, so a link is always
// <your app>/join?token_hash=…&type=… and is redeemed by the app itself. A mail
// scanner that opens the link spends nothing: the token is only spent when the
// person presses the button on that page.
//
// WITH NO SMTP SET, nothing is sent and each message is written to
// data/outbox/ for whoever runs the server to read, readable by that account
// only. That is for trying the edition out; a church needs SMTP.

import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { REPO_ROOT } from './config.mjs';

const TEMPLATES = {
  invite: { file: 'invite.html', subject: 'You are invited to Hope Beacon' },
  recovery: { file: 'recovery.html', subject: 'Choose a new Hope Beacon password' },
};

function fill(template, values) {
  return template
    .replaceAll('{{ .SiteURL }}', values.siteUrl)
    .replaceAll('{{ .TokenHash }}', values.tokenHash);
}

function plainText(kind, link, otp) {
  const lead = kind === 'recovery'
    ? 'Somebody asked to reset the password for this address. If it was you, open this link to choose a new one:'
    : 'You have been invited to Hope Beacon. Open this link to accept and choose your password:';
  return `${lead}\n\n${link}\n\nIf the link does not open, type this code on the page instead: ${otp}\n\nIf this was not you, ignore this e-mail; nothing changes.\n`;
}

export function createMailer(cfg) {
  const smtp = cfg.smtp;
  let transport = null;
  if (smtp.url) {
    transport = nodemailer.createTransport(smtp.url);
  } else if (smtp.host) {
    transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.port !== 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
  }
  const outbox = path.join(cfg.dataDir, 'outbox');

  return {
    configured: Boolean(transport),

    /** Send the link for `kind` (invite or recovery). Throws with the provider's words on refusal. */
    async sendLink({ kind, to, tokenHash, otp }) {
      const spec = TEMPLATES[kind] ?? TEMPLATES.invite;
      const html = fill(fs.readFileSync(path.join(REPO_ROOT, 'docs/email-templates', spec.file), 'utf8'), {
        siteUrl: cfg.siteUrl,
        tokenHash,
      });
      const link = `${cfg.siteUrl}/join?token_hash=${tokenHash}&type=${kind === 'recovery' ? 'recovery' : 'invite'}`;
      const message = {
        from: smtp.from ? { name: smtp.fromName, address: smtp.from } : undefined,
        to,
        subject: spec.subject,
        html,
        text: plainText(kind, link, otp),
      };
      if (transport) {
        if (!smtp.from) throw new Error('SMTP_FROM is not set, so there is no address to send from.');
        await transport.sendMail(message);
        return 'smtp';
      }
      fs.mkdirSync(outbox, { recursive: true, mode: 0o700 });
      const file = path.join(outbox, `${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}.txt`);
      fs.writeFileSync(file, `To: ${to}\nSubject: ${spec.subject}\n\n${message.text}`, { mode: 0o600 });
      console.log(JSON.stringify({ at: 'mail', note: 'no SMTP configured; message written to the outbox', kind }));
      return 'outbox';
    },
  };
}
