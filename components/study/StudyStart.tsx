'use client';

// Start studying: four ways in, at the top of the room, in Simple and Advanced.
//
// ---------------------------------------------------------------------------
// ASKED FOR ON 16 NOVEMBER 2026: the room read as a prototype -- a list of
// pages under drawn furniture -- when it should feel like a finished, calm
// place to study, simple to use, and hands-on for somebody who studies on
// paper as much as for somebody who studies on a screen.
//
// SO THE FIRST THING IS WHAT YOU CAN DO, not what you already have. Each card
// makes a page already laid out (lib/study/templates.ts) and opens it, so the
// first tap is the start of the study rather than a blank page to stare at:
//
//   Bible study     on screen: read, notice, understand, live it
//   Study on paper  pen and paper: the steps for the notebook, then a photo
//   Sermon notes    either way, during the sermon
//   Today's journal the day's own page (the room's Journal)
//
// A LABEL ON EACH SAYS HOW YOU STUDY with it (On screen, Pen and paper,
// Either), because the two ways are the point of the request and a person
// should not have to open a card to find out which one it is.
// ---------------------------------------------------------------------------

type Way = 'screen' | 'paper' | 'either';

const STARTS: Array<{ id: string; title: string; about: string; way: Way; mark: string; template?: string }> = [
  { id: 'bible-study', template: 'bible-study', title: 'Bible study', about: 'One passage, step by step', way: 'screen', mark: '📖' },
  { id: 'paper-study', template: 'paper-study', title: 'Study on paper', about: 'Your Bible and notebook, then a photo', way: 'paper', mark: '✍️' },
  { id: 'sermon-notes', template: 'sermon-notes', title: 'Sermon notes', about: 'The main point and what you will do', way: 'either', mark: '🎙️' },
  { id: 'journal', title: 'Today’s journal', about: 'A page for today, kept by date', way: 'either', mark: '🗓️' },
];

const WAY: Record<Way, string> = { screen: 'On screen', paper: 'Pen and paper', either: 'Either way' };

export function StudyStart({ onTemplate, onToday }: {
  onTemplate: (id: string) => void;
  onToday: () => void;
}) {
  return (
    <section aria-labelledby="sr-start-head" className="sr-start mt-6" data-study-start-row>
      <h2 id="sr-start-head" className="sr-start-head">Start studying</h2>
      <ul className="sr-start-grid">
        {STARTS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="sr-start-card"
              data-study-start={s.id}
              data-way={s.way}
              onClick={() => (s.template ? onTemplate(s.template) : onToday())}
            >
              <span aria-hidden className="sr-start-mark">{s.mark}</span>
              <span className="sr-start-title">{s.title}</span>
              <span className="sr-start-about">{s.about}</span>
              <span className="sr-start-way">{WAY[s.way]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
