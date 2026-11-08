// A note on the whiteboard connects on all four sides, like a shape does.
//
// ---------------------------------------------------------------------------
// ASKED FOR (8 November 2026): "the connecting tools are confusing, is it just
// left and right or with north and south connection?"
//
// What AFFiNE did: a selected SHAPE had an arrow on each of its four sides; a
// tap made a new shape there, joined by a line, and a drag drew a line to
// anything. A selected NOTE had a "+" on its left and right only, and a tap on
// one made a new note beside it with NO line between them. So one board had
// two meanings for the same kind of button, and a note could not be joined
// above or below by a tap at all.
//
// The convention people already know from canvas apps: every card can be
// joined from any of its four edges. A dot on the edge; drag it to another card
// to join them; let go on empty board to make a new card at the end. That is
// what a note does here now:
//
//   * four round handles, top, right, bottom and left, on a selected note;
//   * a TAP on one makes a new note on that side AND the line to it;
//   * a DRAG is AFFiNE's own: a line to whatever it is dropped on, or, on empty
//     board, AFFiNE's choice of what to make there.
//   * the new note goes AFFiNE's distance away on that side, and further along
//     if something is already there, never on top of another card.
//
// Shapes are left exactly as AFFiNE draws them. This is the room's own code
// laid over AFFiNE's widget (`edgeless-auto-complete`): its two methods for a
// note are replaced, everything else, the drag included, is AFFiNE's. If a
// later AFFiNE renames them, connectOnEverySide() says so and changes nothing
// (tests/e2e/the-whiteboard-says-what-you-can-do.js checks the four handles).
// ---------------------------------------------------------------------------

import { ShapeElementModel } from '@blocksuite/affine/model';
import { html, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

/** AFFiNE's own order for the four sides. */
const enum Side { Right = 0, Bottom = 1, Left = 2, Top = 3 }
const SIDES: Array<{ side: Side; name: string }> = [
  { side: Side.Top, name: 'top' },
  { side: Side.Right, name: 'right' },
  { side: Side.Bottom, name: 'bottom' },
  { side: Side.Left, name: 'left' },
];

/** Where a line leaves this card and where it meets the next, as fractions of each card. */
const ENDS: Record<Side, { from: [number, number]; to: [number, number] }> = {
  [Side.Right]: { from: [1, 0.5], to: [0, 0.5] },
  [Side.Bottom]: { from: [0.5, 1], to: [0.5, 0] },
  [Side.Left]: { from: [0, 0.5], to: [1, 0.5] },
  [Side.Top]: { from: [0.5, 0], to: [0.5, 1] },
};

/**
 * How far outside the note's edge a handle sits, in screen pixels: where
 * AFFiNE puts a shape's arrows. Nearer the edge, a finger's tap was taken by
 * AFFiNE's 6px resize strip along the edge instead (a phone snaps a tap to
 * the nearest thing that answers it; found by the whiteboard walk, 8 November
 * 2026).
 */
const OUT = 22;
/**
 * How far AFFiNE lifts its bar above a single shape, so the shape's top arrow
 * is not under it (its `sideMap`). A single note gets the same, for its top
 * handle.
 */
const LIFT = { top: 26, bottom: -26 };
/** A handle's tappable size: a finger's. */
const HIT = 44;

type Toolbar = HTMLElement & {
  sideOptions$: { value: unknown };
  updateWithSurface(ctx: unknown, activated: boolean, ids: string[]): void;
  std: { get(id: unknown): unknown };
};

/** AFFiNE's own box type: x, y, w, h, and whether it is copied. */
type Box = { x: number; y: number; w: number; h: number; clone(): Box };

type Widget = HTMLElement & {
  current: unknown;
  selectedRect: { width: number; height: number };
  gfx: {
    selection: { selectedIds: string[] };
    getElementsByBound(bound: Box): Array<{ id: string; type?: string }>;
    viewport: {
      viewportBounds: Box;
      zoom: number;
      setCenter(x: number, y: number): void;
    };
  };
  _computeNextBound(side: Side): Box;
  _onPointerDown(e: PointerEvent, side: Side): void;
  _addConnector(source: { id: string; position: [number, number] }, target: { id: string; position: [number, number] }): unknown;
  _renderArrow(): unknown;
  _generateElementOnClick(side: Side): void;
};

const isShape = (w: Widget) => w.current instanceof ShapeElementModel;

/** The four round handles around a selected note. */
function renderHandles(this: Widget): TemplateResult[] {
  // A locked thing is not changed from the board, joined or otherwise: its
  // bar offers only Unlock, and the card with the page's writing is locked.
  if ((this.current as { isLocked?: () => boolean } | undefined)?.isLocked?.()) return [];
  const { width, height } = this.selectedRect;
  return SIDES.map(({ side, name }) => {
    const [x, y] = side === Side.Top ? [width / 2, -OUT]
      : side === Side.Right ? [width + OUT, height / 2]
        : side === Side.Bottom ? [width / 2, height + OUT]
          : [-OUT, height / 2];
    return html`<div
      class="sr-join"
      data-join=${name}
      role="button"
      aria-label=${`Join a new note ${name === 'top' ? 'above' : name === 'bottom' ? 'below' : `on the ${name}`}`}
      style=${styleMap({
        position: 'absolute',
        left: `${x - HIT / 2}px`,
        top: `${y - HIT / 2}px`,
        width: `${HIT}px`,
        height: `${HIT}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        cursor: 'crosshair',
        touchAction: 'none',
      })}
      @pointerdown=${(e: PointerEvent) => { e.stopPropagation(); this._onPointerDown(e, side); }}
    ><span style=${styleMap({
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      background: 'var(--affine-primary-color, #1e96eb)',
      boxShadow: '0 0 0 3px #fff, 0 1px 3px rgba(0,0,0,.25)',
    })}></span></div>`;
  });
}

/** The gap AFFiNE leaves between a note and the next, and how far to look for room. */
const GAP = 100;
const TRIES = 8;

/**
 * WHERE A NEW NOTE GOES: on that side, AFFiNE's distance away, and then on
 * along that side until nothing is under it. AFFiNE puts it at that distance
 * whatever is there, so a tap below a note could drop the new one on top of
 * the next card down (seen 8 November 2026). Chosen before the note is made,
 * so the caret AFFiNE then places lands in the new note, not the one under it.
 */
function freeBound(this: Widget, original: (side: Side) => Box, side: Side): Box {
  const from = (this.current as { id?: string } | undefined)?.id;
  const bound = original.call(this, side);
  const taken = (b: Box) => this.gfx.getElementsByBound(b)
    .some((el) => el.id !== from && el.type !== 'connector');
  for (let i = 0; i < TRIES && taken(bound); i++) {
    if (side === Side.Right) bound.x += bound.w + GAP;
    else if (side === Side.Left) bound.x -= bound.w + GAP;
    else if (side === Side.Bottom) bound.y += bound.h + GAP / 2;
    else bound.y -= bound.h + GAP / 2;
  }
  inView.call(this, bound);
  return bound;
}

/**
 * THE NEW NOTE IN VIEW. Made past the edge of the board's window, a new note
 * was half out of sight with its caret in it (seen on a desktop, 8 November
 * 2026). The board moves only as far as it must, once, before the note is
 * made, so the caret AFFiNE then places lands where the note is drawn. Not
 * animated on purpose: the caret is placed by screen position a frame later.
 */
function inView(this: Widget, bound: Box) {
  const { viewport } = this.gfx;
  const view = viewport.viewportBounds;
  const pad = 24 / viewport.zoom;
  const shift = (lo: number, hi: number, viewLo: number, viewHi: number) =>
    lo - pad < viewLo ? lo - pad - viewLo : hi + pad > viewHi ? Math.min(hi + pad - viewHi, lo - pad - viewLo) : 0;
  const dx = shift(bound.x, bound.x + bound.w, view.x, view.x + view.w);
  const dy = shift(bound.y, bound.y + bound.h, view.y, view.y + view.h);
  if (dx || dy) viewport.setCenter(view.x + view.w / 2 + dx, view.y + view.h / 2 + dy);
}

/** A tap on a handle: a new note on that side, and the line to it. */
function joinNewNote(this: Widget, original: (side: Side) => void, side: Side) {
  const from = this.current as { id: string } | undefined;
  original.call(this, side);
  const made = this.gfx.selection.selectedIds[0];
  if (!from || !made || made === from.id) return;
  this._addConnector({ id: from.id, position: ENDS[side].from }, { id: made, position: ENDS[side].to });
}

let done = false;

/**
 * Gives every selected note four handles that join, as a shape has. Call once
 * AFFiNE's effects are registered; safe to call again. Returns whether the
 * board has them.
 */
export function connectOnEverySide(): boolean {
  if (done) return true;
  const Widget = customElements.get('edgeless-auto-complete') as { prototype: Widget } | undefined;
  const proto = Widget?.prototype;
  if (!proto || typeof proto._renderArrow !== 'function' || typeof proto._generateElementOnClick !== 'function') {
    console.warn('The whiteboard could not add handles on every side of a note: AFFiNE changed edgeless-auto-complete.');
    return false;
  }
  const renderArrow = proto._renderArrow;
  const generate = proto._generateElementOnClick;
  const nextBound = proto._computeNextBound;
  if (typeof nextBound === 'function') {
    proto._computeNextBound = function (this: Widget, side: Side) {
      return isShape(this) ? nextBound.call(this, side) : freeBound.call(this, nextBound, side);
    };
  }
  proto._renderArrow = function (this: Widget) {
    return isShape(this) ? renderArrow.call(this) : renderHandles.call(this);
  };
  proto._generateElementOnClick = function (this: Widget, side: Side) {
    if (isShape(this)) { generate.call(this, side); return; }
    joinNewNote.call(this, generate, side);
  };

  // The bar over ONE selected note is lifted as AFFiNE lifts it over one
  // shape, so the top handle is clear of it. Without the bar's widget nothing
  // changes but where the bar sits.
  const Bar = customElements.get('affine-toolbar-widget') as { prototype: Toolbar } | undefined;
  const bar = Bar?.prototype;
  if (bar && typeof bar.updateWithSurface === 'function') {
    const update = bar.updateWithSurface;
    bar.updateWithSurface = function (this: Toolbar, ctx: unknown, activated: boolean, ids: string[]) {
      update.call(this, ctx, activated, ids);
      if (!activated || ids.length !== 1) return;
      const flavour = (ctx as { flavour$?: { value?: string } }).flavour$?.value;
      if (flavour === 'affine:surface:note') this.sideOptions$.value = LIFT;
    };
  }
  done = true;
  return true;
}
