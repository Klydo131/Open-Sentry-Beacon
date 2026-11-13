'use client';

// Where a message is written: one rounded bar, the way every chat app has it.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 1 OCTOBER 2026, the composer ringed in red on a phone: a boxed
// paperclip, a tall grey field, and a pale circle that looked switched off.
// Now:
//
//   [paperclip]  ( Write a message…        )  (●)
//
//   * The paperclip is a plain icon, not a box. It is still a full-size
//     target, and still says "Attach a file" to a screen reader.
//   * The field is a pill that grows with what is typed (MessageBox: emoji by
//     :name, Enter to send on a computer, Return for a new line on a phone).
//   * ONE ROUND BUTTON, and it says what it will do. Empty: a microphone, to
//     record a voice message, where the browser can. Something typed: a solid
//     Send. Changing a message: Save. Never a faded circle that looks broken.
//
// ABOVE IT, WHEN THERE IS ONE: what you are replying to, or that you are
// changing a message, each with a way out.
//
// WHILE RECORDING the bar becomes Cancel, the time, and Send (lib/talk/voice.ts).
// It never sends on its own, even at the two-minute limit.
//
// THE FORM HOLDS EXACTLY ONE TEXT BOX AND ONE BUTTON, and the attach control
// stays outside it. The tutorial's anchor is [data-quest="chat-send"], and the
// walks reach into it by position: the text box is its first textarea and Send
// its first button. Anything else inside the form would be the "first button"
// a walk presses. (Learned the hard way; see the history in components/Chat.tsx.)
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { MessageBox } from '@/components/MessageBox';
import { CheckGlyph, CloseGlyph, MicGlyph, PaperclipGlyph, PencilGlyph, ReplyGlyph, SendGlyph, TrashGlyph } from '@/components/Glyph';
import { canRecordVoice, useVoiceRecorder, VOICE_MAX_MS } from '@/lib/talk/voice';
import { clockDuration } from '@/lib/talk/thread';

export type ComposerMode =
  | { kind: 'new' }
  | { kind: 'reply'; who: string; snippet: string }
  | { kind: 'edit' };

export function Composer({
  value,
  onChange,
  mode,
  onCancelMode,
  onSubmit,
  busy = false,
  onAttach,
  attachAccept,
  onAttachIntent,
  onVoice,
  focusSignal,
}: {
  value: string;
  onChange: (next: string) => void;
  mode: ComposerMode;
  onCancelMode: () => void;
  onSubmit: () => void;
  busy?: boolean;
  onAttach?: (file: File) => void;
  attachAccept?: string;
  /** The paperclip was reached for: the photo note can open now. */
  onAttachIntent?: () => void;
  /** Where a recorded voice message goes. Without it, no microphone. */
  onVoice?: (file: File) => void;
  /** Changes whenever the field should take the keyboard (Reply, Edit). */
  focusSignal?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const voice = useVoiceRecorder();
  // Decided after the page is in the browser, never while drawing: the server
  // cannot know, and disagreeing with it is a hydration error.
  const [offersVoice, setOffersVoice] = useState(false);
  useEffect(() => { setOffersVoice(!!onVoice && canRecordVoice()); }, [onVoice]);
  const typed = value.trim().length > 0;
  const editing = mode.kind === 'edit';
  const recording = voice.state === 'recording' || voice.state === 'asking' || voice.state === 'ready';

  useEffect(() => {
    if (focusSignal === undefined) return;
    formRef.current?.querySelector('textarea')?.focus();
  }, [focusSignal]);

  const sendVoice = async () => {
    const file = await voice.finish();
    if (file && onVoice) onVoice(file);
  };

  // What the one round button is, right now.
  const action: 'send' | 'save' | 'record' | 'idle' =
    editing ? 'save' : typed ? 'send' : offersVoice ? 'record' : 'idle';

  return (
    <div
      className="border-t border-black/[0.06] bg-white px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-3"
      data-chat-composer
      // ESCAPE PUTS AWAY THE NEAREST THING: a recording, then a reply or an
      // edit. Marked handled so the chat panel does not close as well.
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (recording) { event.preventDefault(); voice.cancel(); return; }
        if (mode.kind !== 'new') { event.preventDefault(); onCancelMode(); }
      }}
    >
      {mode.kind !== 'new' && !recording && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-slate-50 py-1.5 pl-3 pr-1 ring-1 ring-black/5" data-composer-mode={mode.kind}>
          <span className="text-[#1F7A8C]">
            {mode.kind === 'reply' ? <ReplyGlyph size={18} /> : <PencilGlyph size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.722rem] font-bold text-[#1F7A8C]">
              {mode.kind === 'reply' ? `Replying to ${mode.who}` : 'Changing your message'}
            </p>
            {mode.kind === 'reply' && (
              <p className="truncate text-[0.722rem] text-slate-600">{mode.snippet}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancelMode}
            aria-label={mode.kind === 'reply' ? 'Stop replying' : 'Stop changing the message'}
            className="tap-sm grid w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white"
          >
            <CloseGlyph size={18} />
          </button>
        </div>
      )}

      {voice.error && !recording && (
        <p role="alert" className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[0.722rem] text-amber-900 ring-1 ring-amber-200">
          {voice.error}
        </p>
      )}

      {recording ? (
        // RECORDING: cancel, the time, send. The dot pulses only where motion
        // is welcome (globals.css .voice-dot).
        <div className="flex items-center gap-2" data-voice-recorder>
          <button
            type="button"
            onClick={voice.cancel}
            aria-label="Delete the recording"
            className="tap grid aspect-square shrink-0 place-items-center rounded-full text-red-600 hover:bg-red-50"
          >
            <TrashGlyph size={22} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-slate-100 px-4 py-3.5" role="status" aria-live="polite">
            <span aria-hidden className={`voice-dot h-2.5 w-2.5 shrink-0 rounded-full ${voice.state === 'ready' ? 'bg-slate-400' : 'bg-red-500'}`} />
            <span className="font-semibold tabular-nums text-navy">
              {clockDuration(voice.elapsed / 1000)}
            </span>
            <span className="truncate text-[0.722rem] text-slate-600">
              {voice.state === 'asking'
                ? 'Allow the microphone…'
                : voice.state === 'ready'
                  ? 'Two minutes is the most. Send it, or delete it.'
                  : `Recording · up to ${clockDuration(VOICE_MAX_MS / 1000)}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void sendVoice()}
            disabled={voice.state === 'asking' || busy}
            aria-label="Send the voice message"
            className="tap grid aspect-square shrink-0 place-items-center rounded-full bg-[#1F7A8C] text-white shadow-sm disabled:opacity-50"
          >
            <SendGlyph size={22} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          {onAttach && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={attachAccept}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  // NOT cleared here: WebKit invalidates a File once its input
                  // is cleared, and the upload reads it asynchronously. It is
                  // cleared on the way IN instead, below.
                  const chosen = event.target.files?.[0];
                  if (chosen) onAttach(chosen);
                }}
              />
              <button
                type="button"
                disabled={busy || editing}
                onClick={() => {
                  if (fileRef.current) fileRef.current.value = '';
                  onAttachIntent?.();
                  fileRef.current?.click();
                }}
                className="tap grid aspect-square shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-40"
                data-attach
              >
                <PaperclipGlyph size={22} />
                <span className="sr-only">Attach a file</span>
              </button>
            </>
          )}
          <form
            ref={formRef}
            data-quest="chat-send"
            data-live-composer
            className="flex min-w-0 flex-1 items-end gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (action === 'record') { void voice.start(); return; }
              if (!typed || busy) return;
              onSubmit();
            }}
          >
            <MessageBox
              value={value}
              onChange={onChange}
              onSend={() => { if (typed && !busy) onSubmit(); }}
              placeholder={editing ? 'Change your message' : 'Write a message'}
              ariaLabel="Message"
              className="rounded-[28px] bg-slate-100 py-[15px] text-[length:max(16px,0.889rem)] leading-snug ring-1 ring-black/[0.04] focus:bg-white"
            />
            <button
              type={action === 'record' ? 'button' : 'submit'}
              onClick={action === 'record' ? () => void voice.start() : undefined}
              disabled={action === 'idle' || busy}
              aria-label={action === 'record' ? 'Record a voice message' : action === 'save' ? 'Save the change' : 'Send'}
              className={`tap grid aspect-square shrink-0 place-items-center rounded-full transition-colors ${
                action === 'record'
                  ? 'bg-[#1F7A8C]/10 text-[#1F7A8C] hover:bg-[#1F7A8C]/15'
                  : action === 'idle'
                    ? 'bg-slate-100 text-slate-400'
                    : 'bg-[#1F7A8C] text-white shadow-sm hover:bg-[#19697a]'
              }`}
              data-composer-action={action}
            >
              {action === 'record' ? <MicGlyph size={22} /> : action === 'save' ? <CheckGlyph size={22} /> : <SendGlyph size={22} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
