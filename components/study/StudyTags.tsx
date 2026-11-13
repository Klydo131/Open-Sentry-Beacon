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
import { CloseGlyph, TagGlyph } from '@/components/Glyph';

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
    // `contents`: the tags, the field and the button join the line their
    // parent draws -- beside the folder -- instead of starting a row of their
    // own. A plain div with no role, so nothing is lost to a screen reader.
    <div className="contents">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-9 items-center gap-1 rounded-full bg-[rgba(232,184,75,0.2)] pl-3 pr-1 text-[15px] font-semibold text-[#5b4410]"
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
            className="grid h-7 min-h-0 w-7 place-items-center rounded-full opacity-70 hover:bg-black/5 hover:opacity-100"
          >
            <CloseGlyph size={13} />
          </button>
        </span>
      ))}

      <label className="sr-field">
        <TagGlyph size={15} />
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
          className="w-28"
        />
      </label>
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
          // THE WORD, NOT THE TAG. This read `Add {cleanTag(draft)}`, which put
          // whatever somebody was typing inside the button: at the 24-character
          // limit it measured 322px, and it restated a word already on the
          // screen two inches to the left. The name of the tag belongs to the
          // screen reader, where it is the only way to know which tag this
          // button adds.
          aria-label={`Add the tag ${cleanTag(draft)}`}
          className="tap-sm rounded-full bg-navy px-4 text-[15px] font-semibold text-white"
        >
          Add
        </button>
      ) : null}
    </div>
  );
}

export default StudyTags;
