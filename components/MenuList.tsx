'use client';

// The Menu tab: every room this person has, written out, one tap each.
//
// ---------------------------------------------------------------------------
// ONE LIST, THE SAME ONE AS THE DESKTOP RAIL. The rooms come from
// railGroupsFor() in RoomRails.tsx, which is what the left rail draws at
// 1280px and up. So a room added for one role appears in both places or in
// neither, and a phone can never again be missing a room a desktop has -- the
// defect tests/live-header-fits.mjs was first written to catch, when the Office
// was reachable on a Mac and nowhere else. The sample side and the live side
// both hand their groups to this component, so they cannot drift either.
//
// SHAPED LIKE THE MENU PEOPLE ALREADY KNOW: who you are at the top, then the
// places you can go, then the way out at the bottom. The picture that asked for
// it was a messaging app's own Menu tab; the rows here are this app's rooms
// and nothing else. Emoji mark each room as they do on the rail (decoration,
// which Glyph.tsx allows); the chevron you press toward is drawn.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import type { RailGroup } from '@/components/RoomRails';
import { Avatar } from '@/components/ui';
import { ChevronGlyph } from '@/components/Glyph';
import { emitQuest } from '@/lib/quest';
import { FreshMenu } from '@/components/FreshMenu';
import { useChosenLook } from '@/components/UiTheme';
import { isFreshLook } from '@/lib/ui-themes';

export interface MenuListProps {
  name: string;
  /** The role's label, or null where the app does not name it (an Explorer). */
  role: string | null;
  photo?: string;
  avatar?: string;
  groups: RailGroup[];
  /** The way out: Sign out on the live side, Switch account on the sample. */
  footer?: React.ReactNode;
}

export function MenuList(props: MenuListProps) {
  const look = useChosenLook();
  if (isFreshLook(look)) return <FreshMenu {...props} />;
  const { name, role, photo, avatar, groups, footer } = props;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-[34px] font-extrabold leading-tight tracking-tight text-room">Menu</h1>

      {/* WHO YOU ARE, and the way to your profile. The profile is not a row
          further down as well: one door to one place. */}
      <ul className="menu-group">
        <li>
          <Link href="/profile" className="menu-row py-3" data-quest="menu-profile">
            <Avatar name={name} size={56} photo={photo} avatar={avatar} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[20px] font-extrabold">{name}</span>
              <span className="block text-[15px] font-semibold text-[rgb(26_34_51_/_0.64)]">
                {role ? `${role} · ` : ''}See your profile
              </span>
            </span>
            <ChevronGlyph size={18} className="text-[rgb(26_34_51_/_0.4)]" />
          </Link>
        </li>
      </ul>

      {groups.map((g) => {
        const links = g.links.filter((l) => l.href !== '/profile');
        if (links.length === 0) return null;
        const id = `menu-${g.title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
        return (
          <section key={g.title} aria-labelledby={id}>
            <h2 id={id} className="menu-group-head">{g.title}</h2>
            <ul className="menu-group">
              {links.map((l) => {
                const home = l.href === '/church';
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="menu-row"
                      // The tutorial's "See the journey chart" points at the
                      // church link. On a phone that link is here now.
                      data-quest={home ? 'church-link' : undefined}
                      onClick={home ? () => emitQuest('beacon:open-church') : undefined}
                      aria-label={l.beta ? `${l.label} (still on beta)` : undefined}
                    >
                      <span className="menu-icon" aria-hidden>{l.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      {l.beta && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[13px] font-bold text-amber-900 ring-1 ring-amber-200">
                          Beta
                        </span>
                      )}
                      {!!l.badge && l.badge > 0 && (
                        <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-[#1e2a4a] px-1.5 text-[13px] font-bold text-white">
                          {l.badge}
                        </span>
                      )}
                      <ChevronGlyph size={18} className="text-[rgb(26_34_51_/_0.4)]" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {footer && <ul className="menu-group">{footer}</ul>}
    </div>
  );
}
