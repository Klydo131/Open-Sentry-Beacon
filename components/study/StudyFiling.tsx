'use client';

// Filing a page: its folder and its tags, behind one button that says what
// they are for.
//
// ---------------------------------------------------------------------------
// REPORTED on 27 October 2026, with the two boxes circled: "the 'no folder' and
// 'add tag' boxes is not helping the user to understand it's uses." Two empty
// pill-shaped boxes between the title and the writing read as part of the
// page, said nothing about what they were for, and pushed the writing down.
//
// So filing is one quiet button under the title that says where the page is
// filed ("Not filed yet", or "In Romans study · 2 tags"). Pressing it opens
// both fields with a sentence and an example each: a folder is a drawer that
// keeps pages together; a tag is a word to find a page by later. Nothing about
// how they work changed, and the shelf still filters by both.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

import { FolderGlyph } from '@/components/Glyph';
import { StudyTags } from '@/components/study/StudyTags';

export function StudyFiling({ folder, knownFolders, onFolder, tags, knownTags, onTags }: {
  folder: string;
  knownFolders: string[];
  onFolder: (next: string) => void;
  tags: string[];
  knownTags: string[];
  onTags: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(folder);
  useEffect(() => { setDraft(folder); }, [folder]);

  const where = folder
    ? `In ${folder}${tags.length ? ` · ${tags.length} tag${tags.length === 1 ? '' : 's'}` : ''}`
    : tags.length ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : 'Not filed yet';

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="sr-filing"
        className="sr-filing-button tap-sm"
        data-filing
      >
        <FolderGlyph size={16} />
        <span>File this page</span>
        <span className="sr-filing-where">{where}</span>
      </button>

      {open && (
        <div id="sr-filing" className="sr-filing" role="group" aria-label="File this page">
          <label className="block">
            <span className="sr-filing-label">Folder</span>
            <span className="sr-filing-help">
              Keeps pages that belong together in one place, like a drawer. For example: Romans study.
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => onFolder(draft)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              list="study-folders"
              maxLength={40}
              placeholder="Type a folder name"
              aria-label="Which folder this page is filed in"
              className="sr-filing-input"
            />
            <datalist id="study-folders">
              {knownFolders.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
          <div className="mt-3">
            <span className="sr-filing-label">Tags</span>
            <span className="sr-filing-help">
              Words to find this page by later. A page can have several. For example: prayer, family.
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StudyTags tags={tags} known={knownTags} onChange={onTags} />
            </div>
          </div>
          <button type="button" onClick={() => { onFolder(draft); setOpen(false); }} className="sr-filing-done tap-sm">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export default StudyFiling;
