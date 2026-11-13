// A plain line icon for each room in the left menu, drawn here (no icon
// package). Shown by the Modern look only (app/themes/modern.css); every other
// look keeps the room's emoji. A room with no drawing here keeps its emoji in
// Modern too.

const D: Record<string, string[]> = {
  '/church': ['M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  '/dm': ['M3 20c0-3 2.7-5 6-5s6 2 6 5', 'M16 4.5a3 3 0 0 1 0 6', 'M18 15c1.9.6 3 2.4 3 5', 'M12 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  '/ds': ['M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M12 12h.01'],
  '/office': ['M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M3 13h18'],
  '/sabbath': ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  '/study': ['M12 6.5C10 5 7 4.5 3 4.5v14c4 0 7 .5 9 2 2-1.5 5-2 9-2v-14c-4 0-7 .5-9 2z', 'M12 6.5v14'],
  '/music': ['M9 18V5l11-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  '/library': ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  '/profile': ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21c0-4 3.6-7 8-7s8 3 8 7'],
  '/mail': ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 7l9 6 9-6'],
  '/settings': ['M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M12 2v3', 'M12 19v3', 'M4.9 4.9 7 7', 'M17 17l2.1 2.1', 'M2 12h3', 'M19 12h3', 'M4.9 19.1 7 17', 'M17 7l2.1-2.1'],
  '/cases': ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  // An app kept in the pocket: four tiles, one lifted out.
  'app': ['M4 4h6v6H4z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z', 'M17 3.5l3.5 3.5L17 10.5 13.5 7z'],
  '/admin': ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
};

/** The room's icon: its emoji, and, where one is drawn, the line icon Modern shows instead. */
export function NavIcon({ href, emoji }: { href: string; emoji: string }) {
  const paths = D[href];
  return (
    <span aria-hidden className="nav-icon w-6 text-center" data-line={paths ? '1' : undefined}>
      <span className="nav-emoji">{emoji}</span>
      {paths && (
        <svg className="nav-line" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" focusable="false">
          {paths.map((d) => <path key={d} d={d} />)}
        </svg>
      )}
    </span>
  );
}
