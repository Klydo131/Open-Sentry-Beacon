'use client';

import { useEffect, useState } from 'react';
import { copyText } from '@/lib/share';
import { useDemo } from '@/lib/demo/store';
import { Card, Button } from '@/components/ui';
import type { Invite, Role } from '@/lib/types';

// Admin / executive: invite a new member by email. The app is invite-only.
//
// Who can invite whom:
//   • Executive admin → Admin, Missionary, Seeker (into an overseen church)
//   • Admin           → Missionary, Seeker (their own church)
//
// The Church Board is not on this list because it is not an account. The board
// approves missionaries off the app; nobody invites them into it.
//
// The invite is created in the in-browser store and the admin copies the link
// by hand. Nothing is emailed, because there is no backend in this build.

const ROLE_LABEL: Record<string, string> = {
  executive: 'Executive admin',
  admin: 'Admin',
  dm: 'Guide',
  ds: 'Someone exploring',
};

const ROLE_OPTIONS: Record<string, Role[]> = {
  executive: ['admin', 'dm', 'ds'],
  admin: ['dm', 'ds'],
};

export function InviteManager() {
  const { db, currentUser, createInvite, revokeInvite } = useDemo();

  const callerRole = currentUser?.role;
  const roleOptions = ROLE_OPTIONS[callerRole ?? 'admin'] ?? ROLE_OPTIONS.admin;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(roleOptions[0]);
  const [lastLink, setLastLink] = useState('');
  const [copied, setCopied] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const linkFor = (inv: Invite) => `${origin}/join?token=${inv.token}`;

  // Keep the selected role valid for the caller's options.
  useEffect(() => {
    if (!roleOptions.includes(role)) setRole(roleOptions[0]);
  }, [roleOptions, role]);

  const invites = [...db.invites].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSend = name.trim() && validEmail;

  const send = () => {
    if (!canSend) return;
    setLastLink(linkFor(createInvite({ full_name: name, email, role })));
    setName('');
    setEmail('');
  };

  const revoke = (id: string) => revokeInvite(id);

  const copy = async (text: string, id: string) => {
    // Only claim it copied if it copied. This said "Copied" unconditionally,
    // including on the browsers where the clipboard is blocked — the link is
    // still on screen to copy by hand, but the label said the job was done.
    if (!(await copyText(text))) return;
    setCopied(id);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">✉️ Invite a member</h2>
      <p className="mb-4 text-sm text-gray-500">
        Beacon is invite-only. Choose a role, add a name and email, and you’ll
        get a secure link to send them.
      </p>

      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="tap w-full min-w-0 rounded-xl bg-white px-3 text-base ring-1 ring-black/5"
          aria-label="Role"
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <div className="hidden sm:block" />
        <div className="sm:col-span-2">
          <Button variant="gold" disabled={!canSend} onClick={send}>
            Create invitation
          </Button>
        </div>
      </div>


      {lastLink && (
        <div className="mt-4 rounded-xl bg-green-50 p-4 ring-1 ring-green-200">
          <p className="font-semibold text-green-800">
            ✓ Invitation created. Send this link to them:
          </p>
          {lastLink && (
            <>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={lastLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="tap min-w-0 flex-1 rounded-xl bg-white px-3 text-sm ring-1 ring-black/5"
                />
                <Button variant="ghost" onClick={() => copy(lastLink, 'last')}>
                  {copied === 'last' ? '✓ Copied' : 'Copy link'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-green-700">
                Paste this into your own email or message. There is no mail server
                in this build.
              </p>
            </>
          )}
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
            Invitations
          </h3>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{inv.full_name}</p>
                  <p className="truncate text-sm text-gray-500">
                    {inv.email} · {ROLE_LABEL[inv.role] ?? inv.role}
                  </p>
                </div>
                <StatusBadge status={inv.status} />
                {inv.status === 'pending' && (
                  <>
                    <button
                      onClick={() => copy(linkFor(inv), inv.id)}
                      className="text-sm font-semibold text-navy underline"
                    >
                      {copied === inv.id ? '✓ Copied' : 'Copy link'}
                    </button>
                    <button
                      onClick={() => revoke(inv.id)}
                      className="text-sm font-semibold text-red-600 underline hover:text-red-700"
                    >
                      Disapprove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: Invite['status'] }) {
  const map: Record<Invite['status'], { label: string; bg: string; fg: string }> = {
    pending: { label: 'Pending', bg: '#FEF3C7', fg: '#92400E' },
    accepted: { label: 'Joined', bg: '#DCFCE7', fg: '#166534' },
    revoked: { label: 'Revoked', bg: '#F3F4F6', fg: '#6B7280' },
  };
  const s = map[status];
  return (
    <span
      className="rounded-full px-3 py-0.5 text-xs font-bold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
