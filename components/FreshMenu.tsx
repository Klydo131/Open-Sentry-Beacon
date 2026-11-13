'use client';

import Link from 'next/link';
import type { MenuListProps } from '@/components/MenuList';
import { Avatar } from '@/components/ui';
import { ChevronGlyph, CalendarGlyph, DocGlyph, FolderGlyph, MusicGlyph, PeopleGlyph } from '@/components/Glyph';
import { useChosenLook } from '@/components/UiTheme';
import { isFreshLook } from '@/lib/ui-themes';
import { emitQuest } from '@/lib/quest';

/** Existing drawn glyphs: decoration beside each room's written name. */
export function FreshRoomIcon({ href }: { href: string }) {
  if (href === '/church') return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></svg>;
  if (href === '/mail') return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>;
  if (href === '/settings') return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /></svg>;
  const Icon = href.startsWith('/sabbath') ? CalendarGlyph
    : href === '/music' ? MusicGlyph
    : href === '/office' || href === '/library' ? FolderGlyph
    : href === '/dm' || href === '/admin' || href === '/ds' ? PeopleGlyph : DocGlyph;
  return <Icon size={24} />;
}

const descriptions: Record<string, string> = {
  '/church': 'Updates and announcements',
  '/dm': 'People you guide and support',
  '/admin': 'People and church care',
  '/ds': 'Your journey and study',
  '/office': 'Plans, tasks and resources',
  '/sabbath': 'Worship and preparation',
  '/library': 'Your personal files',
  '/music': 'Listen, tune, keep the beat',
  '/study': 'Read, write and reflect',
};

/**
 * The line under the welcome, in each look's own voice. The Frutiger Aero
 * lines are the owner's, from the design sheets of 4 October 2026.
 */
const WELCOME_LINES: Record<string, string> = {
  study: 'Take a little time to read, reflect and grow.',
  focus: 'A quiet space for the people and work that matter.',
  'aero-dark': 'Even in quiet moments, there is a light that still leads the way.',
  'aero-technozen': 'Take time to study, reflect and grow.',
  'aero-dorfic': 'You are making a difference in someone\'s journey.',
  'aero-colors': 'Your spaces for faith, growth and meaningful connection.',
};
const WELCOME_LINE = 'Small steps of faith lead to bigger stories of hope.';

/** Absent on Classic. Links and counts come from the real menu. */
export function FreshMenu({ name, role, photo, avatar, groups, footer }: MenuListProps) {
  const look = useChosenLook();
  if (!isFreshLook(look)) return null;
  const firstName = name.trim().split(/\s+/)[0] || 'friend';
  const copy = WELCOME_LINES[look] ?? WELCOME_LINE;
  return (
    <div className="fresh-menu" data-fresh-menu>
      <h1 className="fresh-page-title">Menu</h1>
      <section className="fresh-hero" aria-label="Welcome">
        {/* Original local artwork is decorative, and never behind the words. */}
        <img className="fresh-art" src={`/themes/${look}.svg`} alt="" width="600" height="320" aria-hidden />
        <div className="fresh-hero-copy">
          <p className="fresh-eyebrow">A little space for hope</p>
          <h2>Welcome back,<br /><span>{firstName}!</span></h2>
          <p className="fresh-intro">{copy}</p>
        </div>
      </section>
      <Link href="/profile" className="fresh-profile" data-quest="menu-profile">
        <Avatar name={name} size={44} photo={photo} avatar={avatar} />
        <span className="fresh-profile-copy"><strong>{name}</strong><span>{role ? `${role} · ` : ''}See your profile</span></span>
        <ChevronGlyph size={18} />
      </Link>
      {groups.map((group) => {
        const links = group.links.filter((link) => link.href !== '/profile');
        if (!links.length) return null;
        const id = `fresh-${group.title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
        const rooms = group.title !== 'You';
        return (
          <section key={group.title} aria-labelledby={id}>
            <h2 id={id} className="menu-group-head">{group.title}</h2>
            <ul className={rooms ? 'fresh-room-grid' : 'fresh-personal-list'}>
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="fresh-room" data-theme-room
                    data-quest={link.href === '/church' ? 'church-link' : undefined}
                    onClick={link.href === '/church' ? () => emitQuest('beacon:open-church') : undefined}
                    aria-label={link.beta ? `${link.label} (still on beta)` : undefined}>
                    <span className="fresh-room-icon" aria-hidden><FreshRoomIcon href={link.href} /></span>
                    <span className="fresh-room-copy"><strong>{link.label}</strong>{descriptions[link.href] && <span>{descriptions[link.href]}</span>}</span>
                    {link.beta && <span className="fresh-beta">Beta</span>}
                    {!!link.badge && link.badge > 0 && <span className="fresh-count">{link.badge}</span>}
                    <ChevronGlyph size={18} className="fresh-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {footer && <ul className="menu-group">{footer}</ul>}
    </div>
  );
}
