// The page that shows somebody what the room can do, by being made of it.
//
// ---------------------------------------------------------------------------
// ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN "Getting Started" DOCUMENT:
// "Make sure there is an instruction manual inside the study room so Explorers
// can see the full potential of the Affine features like what Affine did in the
// tutorial ... I want this kind of tutorial in our Study Room please."
//
// WHY A PAGE AND NOT A HELP SCREEN. docs/STUDY-ROOM.md exists and is thorough
// and almost nobody will read it, because it is somewhere else. AFFiNE's answer
// is the right one: the tutorial IS a document in the workspace, made of the
// blocks it is describing, so the first thing a person does is tick a box in a
// real to-do list and the feature has taught itself.
//
// GIVEN ONCE, NEVER PUT BACK. The same rule as the Faithlife tile in the
// pocket, and for the same reason: a page the app restores is not a default, it
// is a nag. Somebody who reads it and deletes it has said what they want. The
// room records that it has been given its guide, so the answer does not depend
// on the page still being there.
//
// IT IS LIGHT ON PURPOSE. This writes blocks through the store, which the room
// already loads, and touches nothing from the drawing half. So the guide page
// is written while the room opens, before the editor has been fetched at all.
// ---------------------------------------------------------------------------

import { Text, type DocMeta, type Store } from '@blocksuite/store';

import type { StudyWorkspace } from '@/lib/study/workspace';

import { APP_NAME } from '@/lib/brand';

/** The id of the guide page. Fixed, so a room never ends up with two. */
export const GUIDE_PAGE = 'getting-started';

export const GUIDE_TITLE = 'Getting started in your Study Room';

type Line =
  | { kind: 'h1' | 'h2' | 'text' | 'quote'; words: string }
  | { kind: 'todo'; words: string }
  | { kind: 'bullet' | 'number'; words: string }
  | { kind: 'rule' };

/**
 * WHAT THE PAGE SAYS, AS DATA RATHER THAN AS CODE.
 *
 * Separated so the words can be read and argued about without reading a single
 * `addBlock` call, and so a test can assert that the tutorial still mentions a
 * feature after somebody changes that feature.
 */
export const GUIDE_LINES: Line[] = [
  { kind: 'text', words: 'Welcome. This room is yours. Nobody else can read what you write here: not your Guide, not a Director, not the person who set the app up. It is kept in your church’s own database.' },
  { kind: 'text', words: 'Work through the list below and you will have used most of the room. Tick the boxes as you go, they are real.' },

  { kind: 'h2', words: 'Try these' },
  { kind: 'todo', words: 'Click anywhere on this page and start typing' },
  { kind: 'todo', words: 'Press / on a computer to open the menu of everything you can add' },
  { kind: 'todo', words: 'On a phone, use the row of buttons above the page instead' },
  { kind: 'todo', words: 'Select some words, and use the bar that appears to make them bold' },
  { kind: 'todo', words: 'Add a tag under the page name, so you can find this again' },
  { kind: 'todo', words: 'Open Journal, then Today’s page, and write one line about today' },
  { kind: 'todo', words: 'Press Whiteboard at the top of a page, to draw instead of type' },
  { kind: 'todo', words: 'Make a new page from All pages, and name it after what you are reading' },
  { kind: 'todo', words: 'Put a page in a folder, by typing a name in the Folder box' },
  { kind: 'todo', words: 'Narrow the shelf by a tag, then press Save this view to keep the question' },
  { kind: 'rule' },

  { kind: 'h2', words: 'What you can put on a page' },
  { kind: 'bullet', words: 'Headings, to break a long study into parts' },
  { kind: 'bullet', words: 'Bulleted lists, numbered lists, and to-do lists with boxes to tick' },
  { kind: 'bullet', words: 'Quotes, for a verse or a line worth setting apart' },
  { kind: 'bullet', words: 'Tables, for a comparison' },
  { kind: 'bullet', words: 'Pictures and files, straight from your phone. They stay where your notes stay' },
  { kind: 'bullet', words: 'Equations, in proper mathematical notation' },
  { kind: 'bullet', words: 'A kanban board or a table view, to follow a study across weeks' },
  { kind: 'bullet', words: 'The @ key, to point at another of your pages. The page you point at will show the link back' },
  { kind: 'rule' },

  { kind: 'h2', words: 'The three parts of the room' },
  { kind: 'number', words: 'All pages is the shelf. Everything you have written, newest first, with a search over the top' },
  { kind: 'number', words: 'Journal gives every day a page of its own, named for the day, so you never have to name it' },
  { kind: 'number', words: 'Starred is for the few you keep coming back to. The Bin holds what you delete, until you empty it' },
  { kind: 'rule' },

  { kind: 'h2', words: 'Three ways to find something again' },
  { kind: 'bullet', words: 'A tag is what a page is about. Put as many on a page as you like' },
  { kind: 'bullet', words: 'A folder is where you put it. One per page, and typing a name is how a folder starts existing' },
  { kind: 'bullet', words: 'A saved view is a question you keep. It gathers pages you write later, without you doing anything' },
  { kind: 'rule' },

  { kind: 'h2', words: 'Worth knowing' },
  { kind: 'bullet', words: 'Everything saves by itself. There is no save button and nothing to forget' },
  { kind: 'bullet', words: 'If it cannot save, the page says so at the top. It keeps trying, and what you wrote is still there' },
  { kind: 'bullet', words: 'A page you delete goes to the Bin first, and can be put back' },
  { kind: 'bullet', words: `To leave, press the button at the top left. It says ${APP_NAME}, which is where it takes you` },
  { kind: 'rule' },

  { kind: 'quote', words: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth. 2 Timothy 2:15' },
  { kind: 'text', words: 'When you are done with this page, put it in the Bin. It will not come back.' },
];

/**
 * Write the guide into a page.
 *
 * MADE OF THE BLOCKS IT DESCRIBES, which is the whole idea. The to-do items are
 * real `affine:list` blocks, so ticking one is the feature working rather than a
 * picture of it, and the headings and rules are what a person will use an hour
 * later on a page of their own.
 */
export function writeTheGuide(store: Store): void {
  const rootId = store.root?.id ?? store.addBlock('affine:page', {});
  // A canvas, so the whiteboard button works on this page like any other.
  if (store.getBlocksByFlavour('affine:surface').length === 0) {
    try { store.addBlock('affine:surface', {}, rootId); } catch { /* already there */ }
  }
  const noteId = store.getBlocksByFlavour('affine:note')[0]?.id
    ?? store.addBlock('affine:note', {}, rootId);

  // NO HEADING WITH THE PAGE'S OWN NAME. The page's title is drawn large above
  // the writing, so a first block saying the same words printed it twice, one
  // under the other, on the first page every Explorer opens. The name is the
  // page's title (see giveTheGuideOnce), which is also what the shelf lists.

  for (const line of GUIDE_LINES) {
    if (line.kind === 'rule') {
      store.addBlock('affine:divider', {}, noteId);
      continue;
    }
    if (line.kind === 'todo') {
      store.addBlock('affine:list',
        { type: 'todo', checked: false, text: new Text(line.words) }, noteId);
      continue;
    }
    if (line.kind === 'bullet' || line.kind === 'number') {
      store.addBlock('affine:list',
        { type: line.kind === 'bullet' ? 'bulleted' : 'numbered', text: new Text(line.words) },
        noteId);
      continue;
    }
    store.addBlock('affine:paragraph', { type: line.kind, text: new Text(line.words) }, noteId);
  }

  // SOMEWHERE TO START WRITING, under the guide. A page that ends on a full
  // stop gives a person nowhere to put the caret, and the first thing they do
  // after reading this is want to write something.
  store.addBlock('affine:paragraph', { type: 'text' }, noteId);
}

/**
 * Give a room its guide, if it has never had one.
 *
 * A FUNCTION RATHER THAN EIGHT LINES INSIDE THE COMPONENT, and that was not a
 * tidying pass. The rule this holds -- given once, never put back -- cannot be
 * checked from a browser walk, because the only room a walk can reach is the
 * walkthrough's, and the walkthrough keeps its pages in memory and forgets them
 * on reload. So a walk deleting the page and reloading gets a brand new room
 * and the guide correctly reappears: the test passes on a bug and fails on the
 * fix. Out here it can be run against a room that remembers, in Node, which is
 * the only place the question can actually be asked.
 *
 * @param arrived whether the database has answered yet. False means this room's
 *   pages may still be on their way, and writing now would give somebody a
 *   second copy on every device plus a room marked guided that already was.
 */
export function giveTheGuideOnce(room: StudyWorkspace, arrived: boolean): boolean {
  if (!arrived || room.meta.guided) return false;
  try {
    // THE FLAG BEFORE THE WORDS. A failure halfway through leaves an empty
    // guide page rather than one that reappears on every visit, and of those
    // two the nag is worse.
    room.meta.markGuided();
    const guide = room.getDoc(GUIDE_PAGE) ?? room.createDoc(GUIDE_PAGE);
    guide.load();
    const store = guide.getStore();
    if (store.root) return false;
    writeTheGuide(store);
    room.meta.setDocMeta(GUIDE_PAGE, {
      title: GUIDE_TITLE,
      preview: 'Everything this room can do, in one page you can tick off.',
    } as Partial<DocMeta>);
    return true;
  } catch {
    // A room without its guide is a small disappointment. A room that will not
    // open is not, so this never stops anything.
    return false;
  }
}
