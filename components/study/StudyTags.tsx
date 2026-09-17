'use client';

// The tags on the page somebody has open.
//
// ---------------------------------------------------------------------------
// ASKED FOR, IN THE SCREENSHOT OF AFFiNE'S "All docs": a tag on each row and a
// list of tags to filter by. The field has been in BlockSuite's own DocMeta all
// along; nothing had ever written to it.
//
// THE INPUT OFFERS WHAT THE ROOM ALREADY USES, which is the whole difference
// between a tag list and a pile of near-misses. Left to type it fresh, somebody
// writes "Romans", "romans" and "Romans 8" over three weeks and ends up with
// three tags that mean one thing. The datalist puts the room's own tags under
// the cursor, and `withTag` folds a difference in capitals into whichever
// spelling got there first.
//
// IT IS UNDER THE TITLE, NOT BEHIND A MENU. A tag added later is a tag never
// added: the moment somebody knows what a page is about is the moment they name
// it, and that is the moment the title is being typed.
// ---------------------------------------------------------------------------

import { useId, useState } from 'react';

import { TAG_LIMIT, cleanTag, withTag } from '@/lib/study/shelf';

export function StudyTags({ tags, known, onChange }: {
  tags: string[];
  /** Every tag already used anywhere in this room, for the suggestions. */
  known: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = () => {
    const next = withTag(tags, draft);
    setDraft('');
    if (next !== tags) onChange(next);
  };

  const suggestions = known.filter(
    (tag) => !tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
  );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-gold/15 py-1 pl-3 pr-1 text-sm font-semibold text-navy"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            // NAMES WHAT IT TAKES OFF. A row of identical crosses is a row of
            // guesses to anybody reading the screen out loud, and taking the
            // wrong tag off a page is a small thing done silently.
            aria-label={`Take the tag ${tag} off this page`}
            title={`Take the tag ${tag} off this page`}
            className="grid h-6 w-6 place-items-center rounded-full text-base leading-none text-navy/60 hover:bg-navy/10 hover:text-navy"
          >
            <span aria-hidden>×</span>
          </button>
        </span>
      ))}

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // ENTER AND COMMA BOTH FINISH A TAG. Comma is how people type lists
          // without thinking about it, and a tag with a comma in it is nobody's
          // intention.
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
        }}
        onBlur={add}
        list={listId}
        maxLength={TAG_LIMIT}
        placeholder="Add a tag"
        aria-label="Add a tag to this page"
        className="w-32 rounded-full bg-white px-3 py-1 text-sm ring-1 ring-black/10 placeholder:text-gray-400"
      />
      <datalist id={listId}>
        {suggestions.map((tag) => <option key={tag} value={tag} />)}
      </datalist>

      {/* A BUTTON AS WELL AS THE KEY. On a phone the keyboard's return key is
          the one thing that is never where you expect it, and a tag that needs
          a keystroke nobody can find is a feature nobody has. */}
      {cleanTag(draft) ? (
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); add(); }}
          className="rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white"
        >
          Add {cleanTag(draft)}
        </button>
      ) : null}
    </div>
  );
}

export default StudyTags;
