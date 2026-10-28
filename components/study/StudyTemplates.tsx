'use client';

// Templates: a new page already laid out, chosen from a gallery on the shelf.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 October 2026. Simple and Advanced became the same room, and
// Advanced was given "office tools that [are] applicable for education
// sections and office and staff tools". The pages themselves are data in
// lib/study/templates.ts; this is only the gallery that shows them.
//
// BEHIND ONE BUTTON, as filing is (StudyFiling.tsx). Ten cards above the list
// of pages would push somebody's own writing below the fold on a phone, so the
// gallery stays shut until asked for and shuts again once a template is used.
//
// A CARD SAYS WHAT THE PAGE IS FOR, not only its name: "Attendance" is clear
// to a teacher, and the line under it says what is on the page before anybody
// commits to making one.
// ---------------------------------------------------------------------------

import { useState } from 'react';

import { GridGlyph } from '@/components/Glyph';
import { TEMPLATES, TEMPLATE_GROUPS } from '@/lib/study/templates';

export function StudyTemplates({ onUse }: { onUse: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="sr-templates"
        className="sr-filing-button tap-sm"
        data-templates
      >
        <GridGlyph size={16} />
        <span>Templates</span>
        <span className="sr-filing-where">A page already laid out</span>
      </button>

      {open && (
        <div id="sr-templates" className="sr-filing" role="group" aria-label="Templates">
          {TEMPLATE_GROUPS.map(({ group, about }) => (
            <section key={group} className="sr-template-group" aria-label={group}>
              <h2 className="sr-filing-label">{group}</h2>
              <p className="sr-filing-help">{about}</p>
              <ul className="sr-template-cards">
                {TEMPLATES.filter((t) => t.group === group).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="sr-template-card"
                      data-template={t.id}
                      onClick={() => { setOpen(false); onUse(t.id); }}
                    >
                      <span className="sr-template-title">{t.title}</span>
                      <span className="sr-template-about">{t.about}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
