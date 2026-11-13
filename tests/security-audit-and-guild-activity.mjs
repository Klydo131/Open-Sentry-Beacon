// The audit room and Guild board are security boundaries, not just screens.
// Keep their three promises observable from source: audit scope is role based,
// direct table access is closed, and Guild activity never publishes a roster.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260830120000_security_audit_and_guild_activity.sql');
const auditIdFix = read('supabase/migrations/20260830230607_qualify_security_audit_profile_id.sql');
const board = read('components/LiveGuildActivity.tsx');
const guideRoom = read('components/LiveGuildRoom.tsx');
const audit = read('components/LiveSecurityAudit.tsx');
const shell = read('components/LiveAppShell.tsx');
const admin = read('components/live/AdminPage.tsx');
const guildPage = read('app/guilds/page.tsx');

let failures = 0;
const ok = (condition, message) => {
  console.log(`${condition ? 'OK ' : 'BAD'} ${message}`);
  if (!condition) failures++;
};

ok(/create schema if not exists private/.test(migration),
   'privileged audit and Guild functions live behind a non-exposed schema');

for (const table of ['security_audit_events', 'guild_activity_posts', 'guild_activity_amens']) {
  ok(new RegExp(`alter table public\\.${table} enable row level security`).test(migration),
     `${table} has RLS enabled`);
  ok(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`).test(migration),
     `${table} has no direct browser-table access`);
}

ok(/event\.subject_role in \('dm', 'ds'\)/.test(migration),
   'a Director audit feed is limited to Guide and Explorer subjects');
ok(/me\.role = 'executive' and event\.subject_role = 'admin'/.test(migration),
   'only an Executive Director audit feed includes Director subjects');
ok(/from public\.profiles as profile\s+where profile\.id = \(select auth\.uid\(\)\)/.test(migration),
   'the audit function qualifies the profile id instead of colliding with its returned id column');
ok(/from public\.profiles as profile\s+where profile\.id = \(select auth\.uid\(\)\)/.test(auditIdFix),
   'the production correction migration keeps the qualified profile lookup');
ok(!/from public\.messages/.test(migration) && !/from public\.pairing_media/.test(migration),
   'the audit ledger never copies direct-message or attachment content');

const activityResult = /private\.list_guild_activity[\s\S]*?returns table \(([\s\S]*?)\)\s*language plpgsql/.exec(migration)?.[1] ?? '';
ok(!/author_id/.test(activityResult) && /author_label/.test(activityResult),
   'the Guild activity RPC returns a label, never another member author identifier');
ok(/private\.active_guild_member\(p_guild\)/.test(migration),
   'every Guild activity read and write is gated by current Guild membership');
ok(/me\.role in \('dm', 'ds'\)/.test(migration),
   'only Guides and Explorers may use Guild activity at the database boundary');
ok(/post_to_guild/.test(migration) && /toggle_guild_amen/.test(migration),
   'Guild activity has both a share action and a low-risk group response');
ok(/box\.scrollTop = box\.scrollHeight/.test(guideRoom) && !/scrollIntoView/.test(guideRoom.replace(/\/\/[^\n]*/g, '')),
   'the Guides room scrolls its own thread without pulling the Office page downward');

ok(/filter\(\(guild\) => guild\.i_am_in_it\)/.test(board),
   'the Guild page lists only the signed-in member’s Guilds');
// COMMENTS DO NOT RENDER, so they are stripped before this looks. The rule is
// about a rendering path, and the file now carries a comment explaining WHY the
// author column must never be subscribed to -- naming the column in order to
// forbid it is the opposite of leaking it. Same treatment as the scroll check
// above. A real `{post.author_id}` is code, not a comment, and still fails.
const boardCode = board.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok(!/author_id|\.members/.test(boardCode),
   'the Guild page has no roster or author-id rendering path');
ok(/break-words/.test(board) && /break-words/.test(audit),
   'long pasted text or names cannot widen the Guild or audit cards on phones');
ok(/Security audit/.test(audit) && /private\s+conversations or files/.test(audit),
   'the Admin security audit explains that private content is outside the feed');
// THIS ASSERTION USED TO REQUIRE THE GUILD ROOM IN THE HEADER, and it was
// carrying two separate rules in one line: that Guild activity had a door, and
// that leadership's Admin security audit did NOT get a second one beside it.
// The room is archived now, so the first rule is gone and the second is not --
// a duplicate security door would be just as wrong today. Splitting them is
// what keeps the surviving half meaning something; deleting the line would
// have quietly retired a rule nobody decided to retire.
// The archive itself is asserted by tests/the-guild-room-is-archived-not-deleted.mjs.
ok(!/admin\?room=security/.test(shell),
   'the live header does not duplicate the Admin security audit');
ok(/const MEMBERS: Role\[\] = \['dm', 'ds'\]/.test(guildPage),
   'the Guild route does not admit leadership accounts');
ok(/id: 'security'/.test(admin) && /LiveSecurityAudit/.test(admin),
   'the Director and Executive Director admin screen has a Security room');
const rails = read('components/RoomRails.tsx');
// Same split as above: 'My Rooms' still exists and must not grow a second
// door onto the Admin security audit. The Guild Room's absence is the archive's
// business, not this file's.
ok(/title: 'My Rooms'/.test(rails) && !/label: 'Security Audit Room'/.test(rails),
   'the sidebar avoids a duplicate Admin security door');

console.log(failures === 0 ? '\nAll security audit and Guild checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
