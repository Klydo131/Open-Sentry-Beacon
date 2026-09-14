'use client';

import { NAVY } from '@/lib/brand';

// Small, dependency-free building blocks. Senior-friendly by default:
// big text, big tap targets, high contrast.

export function Card({
  children,
  className = '',
  id,
  elevation = 'rest',
  interactive = false,
  'data-panel': dataPanel,
  'data-live-conversation': liveConversation,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * A link target.
   *
   * Declared for the reason the note below gives: a fixed prop list drops what
   * it does not name, so `<Card id="prayer">` compiled fine and put no id in
   * the DOM, and the link pointing at it landed at the top of the page. That is
   * the same failure the note already describes, found again.
   */
  id?: string;
  /**
   * A stable hook for a test that needs to read ONE card rather than guessing
   * which div on the page is the right one. Declared rather than spread,
   * because a fixed prop list silently drops anything it does not name — which
   * is exactly how five tutorial anchors once compiled fine and never reached
   * the DOM.
   */
  'data-panel'?: string;
  /**
   * The private conversation, which globals.css bounds to the height actually
   * left on the glass.
   *
   * DECLARED FOR THE THIRD TIME IN THIS FILE, for the third instance of the
   * same bug. A JSX attribute whose name contains a dash is exempt from excess
   * property checking, so `<Card data-live-conversation>` compiled, passed
   * review, was asserted on by a test that read the SOURCE, and never once
   * reached the DOM. Every rule written against that selector matched nothing,
   * which is why the conversation kept overflowing a phone while a check
   * called "live conversations fit phones and tablets" stayed green.
   */
  'data-live-conversation'?: boolean;
  /**
   * How far off the page this surface sits.
   *
   * `rest` is a card on the page and is the default, so nothing that already
   * used <Card> changes shape. `raised` is for something deliberately lifted —
   * a panel, a dialog, a docked window — which used to be each component's own
   * guess and produced `shadow-2xl` on one screen and `shadow-sm` on the next
   * for the same kind of thing.
   *
   * `interactive` adds the hover response, and only belongs on a card that is
   * a link or a button underneath: a surface that lifts when the pointer passes
   * and does nothing when it is clicked is a lie about what it is.
   */
  elevation?: 'rest' | 'raised';
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white ring-1 ring-black/5 ${
        elevation === 'raised' ? 'lift-3' : 'lift-1'
      } ${interactive ? 'lift-hover' : ''} ${className}`}
      id={id}
      data-panel={dataPanel}
      data-live-conversation={liveConversation ? '' : undefined}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  // The tutorial's anchor, declared rather than spread.
  //
  // This component takes a fixed prop list, so `data-quest` written on a
  // <Button> was accepted by the compiler and then dropped on the floor: the
  // attribute never reached the DOM, the tutorial's spotlight had nothing to
  // find, and five steps across three walks pointed at buttons that — as far
  // as the page was concerned — carried no anchor at all. Naming it here makes
  // it a real prop that cannot silently evaporate again.
  'data-quest': dataQuest,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'gold' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  'data-quest'?: string;
}) {
  const styles: Record<string, string> = {
    primary: 'text-white',
    gold: 'text-navy',
    ghost: 'bg-white text-navy ring-1 ring-navy/20',
    // DELIBERATELY THE SMALLEST AND THE ONLY RED ONE.
    //
    // Disconnecting two people, or removing somebody from the church, is a
    // thing a Director should be able to do and should almost never want to.
    // It used to be a plain `ghost` button: the same size and the same weight
    // as everything else on the row, which is how a screen tells you an action
    // is ordinary. The reported version was worse still — it looked LARGER
    // than the text beside it, so the most destructive control on the page was
    // also the most inviting.
    //
    // Smaller and red, on white rather than filled: red on white reads as a
    // warning, and a filled red block reads as a call to action. Nothing else
    // in the app is red, so the colour means exactly one thing.
    danger: 'bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50',
  };
  // A CALLER'S OWN COLOUR REPLACES THE VARIANT'S; IT DOES NOT RACE IT.
  //
  // These are composed into one class attribute, and Tailwind settles a
  // duplicate by where the rules sit in the GENERATED STYLESHEET, not by the
  // order they appear here. So `ghost` (bg-white text-navy) beside a caller's
  // `bg-red-600 text-white` was always a coin toss, and it landed on white text
  // on a white ground: both delete confirmations in the Admin room rendered as
  // BLANK BUTTONS. Reported as "I still can't see the delete button, I can only
  // see it if I tap or hover" -- and the hover is the proof, because
  // `hover:bg-red-700` finally gave the white text something to sit on.
  //
  // A TEXT SIZE IS NOT A COLOUR. Several callers pass `text-base` purely to
  // resize, and stripping the variant's colour for those would silently take
  // the colour off buttons that never asked to change it.
  const given = className.split(/\s+/).filter(Boolean);
  const isTextSize = (t: string) => /^text-(xs|sm|base|lg|[2-9]?xl)$/.test(t);
  const ownsBg = given.some((t) => t.startsWith('bg-'));
  const ownsText = given.some((t) => t.startsWith('text-') && !isTextSize(t));
  const variantClasses = styles[variant]
    .split(/\s+/)
    .filter((c) => !(ownsBg && c.startsWith('bg-')))
    .filter((c) => !(ownsText && c.startsWith('text-')))
    .join(' ');

  const bg =
    variant === 'primary' ? NAVY : variant === 'gold' ? '#E8B84B' : undefined;
  // A destructive button is smaller than an ordinary one: 44px against 56, and
  // the text a size down. Still comfortably above the 44px minimum for a touch
  // target — discouraged is not the same as hard to press.
  const size = variant === 'danger'
    ? 'tap-sm px-4 text-sm font-bold'
    : 'tap px-5 text-lg font-semibold';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-quest={dataQuest}
      data-danger={variant === 'danger' ? '' : undefined}
      style={bg ? { backgroundColor: bg } : undefined}
      // A FILLED BUTTON LIFTS AND A QUIET ONE DOES NOT. `primary` and `gold`
      // carry the page's weight, so they get the elevation response; `ghost`
      // and `danger` are deliberately quiet and a hovering lift would undo
      // exactly the discouragement `danger` exists to express.
      className={`inline-flex items-center justify-center gap-2 rounded-xl transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none ${
        variant === 'primary' || variant === 'gold' ? 'lift-1 lift-hover' : ''
      } ${size} ${variantClasses} ${className}`}
    >
      {children}
    </button>
  );
}

export function Avatar({
  name,
  size = 48,
  photo,
  avatar,
  onDark = false,
}: {
  name: string;
  size?: number;
  photo?: string;
  avatar?: string;
  /** The fallback circle is navy, which vanishes against the navy header. */
  onDark?: boolean;
}) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photo}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: onDark ? 'rgba(255,255,255,0.16)' : NAVY,
        fontSize: size / 2.4,
      }}
      aria-hidden
    >
      {avatar ? <span>{avatar}</span> : initials}
    </div>
  );
}

export function Badge({
  children,
  color = NAVY,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

// The tab strip. Kept here (rather than in the seeker room) because the demo
// and live rooms both use it and must not drift apart.
//
// On a phone the tabs share the width evenly, icon above label, so all of them
// are visible at once. They used to be a row that scrolled sideways, which
// hides whatever does not fit — and a tab you have to go looking for is a tab
// most people never open. From `sm` up there is room for a normal row.
//
// `badge` puts a count on a tab so a missionary can see there is something
// waiting without opening it.
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: string; badge?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="no-print grid gap-1 sm:flex sm:flex-wrap"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            // Lets the tutorial point at a tab when the control it really wants
            // is behind that tab and therefore not yet in the DOM.
            data-quest={`tab-${t.key}`}
            onClick={() => onChange(t.key)}
            className={`tap relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:text-base ${
              on ? 'text-white' : 'bg-gray-100 text-navy/70 hover:bg-gray-200'
            }`}
            style={on ? { backgroundColor: NAVY } : undefined}
          >
            {t.icon && (
              <span aria-hidden className="text-base sm:text-inherit">
                {t.icon}
              </span>
            )}
            <span className="max-w-full truncate">{t.label}</span>
            {!!t.badge && (
              <span
                className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-navy sm:static sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-xs"
                style={{ backgroundColor: '#E8B84B' }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-navy/15 p-8 text-center">
      <p className="text-lg font-semibold text-navy">{title}</p>
      {hint && <p className="mt-1 text-gray-500">{hint}</p>}
    </div>
  );
}
