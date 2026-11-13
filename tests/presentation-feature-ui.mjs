// The presentation-inspired screens must remain connected to the existing
// feature paths. These guards deliberately check behaviour hooks, not colours:
// a clean card that cannot open, share, send, schedule, or request is a mock.

import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const library = read('app/library/page.tsx');
const liveLibrary = read('components/LiveLibrary.tsx');
const prayer = read('components/LivePrayer.tsx');
const meetings = read('components/LiveMeetings.tsx');
const studies = read('components/LiveStudies.tsx');
// Drawn by components/talk/ChatView.tsx and its Composer for both halves.
const conversation = read('components/talk/ChatView.tsx') + '\n' + read('components/talk/Composer.tsx');

let failed = 0;
const ok = (condition, label) => {
  console.log(`${condition ? 'OK ' : 'BAD'} ${label}`);
  if (!condition) failed++;
};

ok(
  /aria-label="Search library resources"/.test(library)
    && /FAVORITES_KEY/.test(library)
    && /safeExternalUrl/.test(library)
    && /ShareButton/.test(library),
  'the public Library searches, saves locally, opens safe links, and shares',
);
ok(
  /listMedia/.test(library)
    && /saveFilesFromInput/.test(library)
    && /getBlob/.test(library)
    && /deleteMedia/.test(library),
  'the device Library keeps upload, download, playback, and removal connected',
);
ok(
  /live\.listMaterials/.test(liveLibrary)
    && /live\.addMaterial/.test(liveLibrary)
    && /live\.shareMaterial/.test(liveLibrary),
  'the church Library keeps real material and sharing operations connected',
);
ok(
  /live\.addPrayerRequest/.test(prayer)
    && /live\.markPrayingFor/.test(prayer)
    && /live\.deletePrayerRequest/.test(prayer),
  'Prayer keeps request, acknowledgement, and withdrawal actions connected',
);
ok(
  /live\.scheduleMeeting/.test(meetings)
    && /live\.confirmMeeting/.test(meetings)
    && /live\.cancelMeeting/.test(meetings)
    && /joinUrl/.test(meetings),
  'Meet-ups keep proposal, confirmation, cancellation, and safe joining connected',
);
ok(
  /live\.listLessonSeries/.test(studies)
    && /live\.listLessons/.test(studies)
    && /live\.attachLessonFile/.test(studies),
  'Lesson Study keeps real series, studies, and handout attachments connected',
);
ok(
  /data-live-thread/.test(conversation)
    && /data-live-composer/.test(conversation)
    && /safe-area-inset-bottom/.test(conversation)
    && /aria-live="polite"/.test(conversation),
  'Chat retains its responsive, live-updating thread and safe mobile composer',
);

console.log(`\n${failed === 0 ? 'RESULT: ALL OK' : `RESULT: ${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
