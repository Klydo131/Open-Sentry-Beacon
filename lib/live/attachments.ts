// What may be attached to a conversation or a lesson, in one place.
//
// THE SAME LIST LIVES IN THE DATABASE, and it is the one that decides: the
// `pairing-media` bucket carries an allow-list of mime types, and Storage
// refuses anything else no matter what this file says. See
// supabase/migrations/0048_a_study_sheet_is_a_word_document.sql, which is also
// where the reasoning for what is left out is written down.
//
// So why have this at all? Because a file picker that will happily let somebody
// choose a file the server is about to refuse is a trap. The report was a Guide
// attaching a study sheet and getting "mime type application/vnd.openxml-
// formats-officedocument.wordprocessingml.document is not supported" back. Half
// of that was the missing type; the other half was being allowed to pick it.
//
// KEEP THE TWO IN STEP. If you widen the bucket, widen this; a type here that
// the bucket refuses is the trap again, and a type in the bucket that is
// missing here is a file people cannot choose.

/** For the `accept` attribute of a file input. Extensions AND mime types,
 *  because Android's picker matches on one and iOS on the other. */
export const ATTACHMENT_ACCEPT = [
  // Photographs.
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  // Documents.
  'application/pdf', '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx',
  'application/vnd.oasis.opendocument.text', '.odt',
  'application/vnd.oasis.opendocument.spreadsheet', '.ods',
  'application/vnd.oasis.opendocument.presentation', '.odp',
  'application/rtf', 'text/rtf', '.rtf',
  // Voice notes.
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
  '.mp3', '.m4a', '.ogg', '.wav',
  // Text.
  'text/plain', '.txt', 'text/csv', '.csv',
].join(',');

/** One line for the screen, so the limits are visible before a file is picked. */
export const ATTACHMENT_HINT =
  'Photos, PDFs, Word, Excel, PowerPoint, audio and text. Up to 10 MB. Video cannot be attached; link to it instead.';
