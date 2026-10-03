'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChosenLook } from '@/components/UiTheme';
import { MenuGlyph, PeopleGlyph, FolderGlyph } from '@/components/Glyph';
import { isFreshLook } from '@/lib/ui-themes';
import { peopleHref, tabFor } from '@/lib/tab-bar';
import type { Role } from '@/lib/types';

// ponytail: extend the existing desktop rail; keep one room list and breakpoint.
export function FreshNav({ role }: { role: Role }) {
  const look = useChosenLook();
  const path = usePathname() || '/';
  if (!isFreshLook(look)) return null;
  const tab = tabFor(path, role);
  const links = [
    { key: 'menu', href: '/menu', label: 'Menu', Icon: MenuGlyph },
    { key: 'people', href: peopleHref(role), label: 'People', Icon: PeopleGlyph },
    { key: 'files', href: '/library', label: 'My Files', Icon: FolderGlyph },
  ];
  return <nav className="fresh-main-nav" aria-label="Main" data-fresh-nav>
    {links.map(({ key, href, label, Icon }) => <Link key={key} href={href} className="fresh-nav-link" aria-current={tab === key ? 'true' : undefined}><Icon size={22} /><span>{label}</span></Link>)}
  </nav>;
}
