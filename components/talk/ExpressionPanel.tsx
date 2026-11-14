'use client';

// Emoji, stickers, an effect for the next message, and your chat's look.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 14 NOVEMBER 2026 (lib/talk/expression.ts has the reasons and
// every list). One panel, opened from the smiling face beside the paperclip,
// with four tabs. It sits between the thread and the message bar, so nothing
// floats over the conversation and the bar never moves from under a thumb.
//
//   Emoji     adds to what you are writing. Nothing is sent.
//   Stickers  one tap sends it, as a reply if you were replying.
//   Effects   chooses what the NEXT message arrives with; a chip above the bar
//             says so, with a way out. It never plays for somebody who has
//             asked their device for less motion.
//   Look      your bubble colour and the ground behind the chat, on this
//             device only, seen only by you.
//
// Every target is 44px or more, and the tabs are a real tab list a keyboard
// can walk with the arrow keys.
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react';
import { CloseGlyph } from '@/components/Glyph';
import {
  BUBBLE_COLOURS, EFFECTS, EFFECT_LABEL, EMOJI_GROUPS, STICKERS, WALLPAPERS,
  type ChatLook, type MessageEffect, type Sticker,
} from '@/lib/talk/expression';

const TABS = [
  { key: 'emoji', label: 'Emoji' },
  { key: 'stickers', label: 'Stickers' },
  { key: 'effects', label: 'Effects' },
  { key: 'look', label: 'Look' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** One sticker, drawn. Used in the panel and in the thread. */
export function StickerArt({ sticker, still = false, small = false }: { sticker: Sticker; still?: boolean; small?: boolean }) {
  return (
    <span
      className={`sticker ${small ? 'sticker-small' : ''} ${still ? '' : `sticker-${sticker.motion}`}`}
      style={{ background: sticker.ground, color: sticker.ink }}
      data-sticker={sticker.label}
    >
      <span aria-hidden className="sticker-emoji">{sticker.emoji}</span>
      <span className="sticker-words">{sticker.label}</span>
    </span>
  );
}

export function ExpressionPanel({
  onEmoji,
  onSticker,
  effect,
  onEffect,
  look,
  onLook,
  onClose,
  canSend,
  effects = true,
}: {
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: Sticker) => void;
  effect: MessageEffect | null;
  onEffect: (effect: MessageEffect | null) => void;
  look: ChatLook;
  onLook: (look: ChatLook) => void;
  onClose: () => void;
  /** False while changing a message: stickers and effects are for new ones. */
  canSend: boolean;
  /** False on a database that does not take effects yet: the tab is not offered. */
  effects?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>('emoji');
  const tabs = useRef<HTMLDivElement>(null);

  const shown = TABS.filter((t) => effects || t.key !== 'effects');

  const walk = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const at = shown.findIndex((t) => t.key === tab);
    const next = shown[(at + (event.key === 'ArrowRight' ? 1 : shown.length - 1)) % shown.length];
    setTab(next.key);
    tabs.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  return (
    <div
      className="expression-panel border-t border-black/[0.06] bg-white"
      data-expression-panel
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <div ref={tabs} role="tablist" aria-label="Ways to say it" className="flex min-w-0 flex-1 gap-1 overflow-x-auto" onKeyDown={walk}>
          {shown.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`expression-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="expression-body"
              tabIndex={tab === t.key ? 0 : -1}
              data-tab={t.key}
              onClick={() => setTab(t.key)}
              className={`tap-sm shrink-0 rounded-full px-3.5 text-[0.833rem] font-bold ${
                tab === t.key ? 'bg-[#1F7A8C]/12 text-[#125e6d]' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close emoji and stickers"
          className="tap-sm grid w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <CloseGlyph size={18} />
        </button>
      </div>

      <div
        id="expression-body"
        role="tabpanel"
        aria-labelledby={`expression-tab-${tab}`}
        className="expression-body overflow-y-auto overscroll-contain px-2 pb-2 pt-1"
      >
        {tab === 'emoji' && EMOJI_GROUPS.map((group) => (
          <div key={group.key} role="group" aria-label={group.label}>
            <p className="px-1.5 pb-0.5 pt-2 text-[0.722rem] font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
            <div className="expression-grid">
              {group.emoji.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onEmoji(emoji)}
                  aria-label={`Add ${emoji}`}
                  className="expression-emoji"
                  data-pick-emoji
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}

        {tab === 'stickers' && (
          <>
            {!canSend && <p className="px-1.5 py-2 text-[0.833rem] text-slate-600">Finish changing your message first, then send a sticker.</p>}
            <div className="sticker-grid pt-2">
              {STICKERS.map((sticker) => (
                <button
                  key={sticker.label}
                  type="button"
                  disabled={!canSend}
                  onClick={() => onSticker(sticker)}
                  aria-label={`Send the sticker: ${sticker.label}`}
                  className="sticker-pick"
                  data-pick-sticker={sticker.label}
                >
                  <StickerArt sticker={sticker} still small />
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'effects' && (
          <div className="pt-2">
            <p className="px-1.5 pb-2 text-[0.833rem] leading-snug text-slate-600">
              Your next message arrives with it. Nothing moves for anybody who has asked their device for less motion.
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Effect for your next message">
              {EFFECTS.map((kind) => {
                const on = effect === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={!canSend}
                    aria-pressed={on}
                    onClick={() => onEffect(on ? null : kind)}
                    className={`tap-sm rounded-full px-3.5 text-[0.833rem] font-bold ring-1 ${
                      on ? 'bg-[#1F7A8C] text-white ring-[#1F7A8C]' : 'bg-white text-slate-700 ring-black/10 hover:bg-slate-50'}`}
                    data-pick-effect={kind}
                  >
                    <span aria-hidden>{EFFECT_LABEL[kind].emoji}</span> {EFFECT_LABEL[kind].label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'look' && (
          <div className="pt-2">
            <p className="px-1.5 pb-2 text-[0.833rem] leading-snug text-slate-600">
              Only you see this, and only on this device.
            </p>
            <p className="px-1.5 pb-1 text-[0.722rem] font-bold uppercase tracking-wide text-slate-500">Your messages</p>
            <div className="flex flex-wrap gap-2 px-1" role="radiogroup" aria-label="Colour of your messages">
              {BUBBLE_COLOURS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={look.colour === c.key}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => onLook({ ...look, colour: c.key })}
                  className={`look-swatch ${look.colour === c.key ? 'look-swatch-on' : ''}`}
                  style={{ background: c.ground || 'var(--bubble-mine)' }}
                  data-pick-colour={c.key}
                />
              ))}
            </div>
            <p className="px-1.5 pb-1 pt-3 text-[0.722rem] font-bold uppercase tracking-wide text-slate-500">Behind the chat</p>
            <div className="flex flex-wrap gap-2 px-1" role="radiogroup" aria-label="Ground behind the chat">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  role="radio"
                  aria-checked={look.paper === w.key}
                  onClick={() => onLook({ ...look, paper: w.key })}
                  className={`look-paper ${w.className || 'chat-ground'} ${look.paper === w.key ? 'look-paper-on' : ''}`}
                  data-pick-paper={w.key}
                >
                  <span className="look-paper-name">{w.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
