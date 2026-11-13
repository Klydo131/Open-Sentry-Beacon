-- Word documents, spreadsheets and slides can be attached to a conversation.
--
-- THE BUG, from a phone: a Guide attached a study sheet and the conversation
-- answered "mime type application/vnd.openxmlformats-officedocument.wordproc-
-- essingml.document is not supported". That sentence is Supabase Storage
-- reading the bucket's allow-list out loud. Nobody can act on it, and the thing
-- it refused is the single most ordinary file a church passes around.
--
-- The allow-list was written for photos, PDFs and voice notes (0022) and simply
-- never had documents in it. It was a gap, not a policy.
--
-- WHAT IS DELIBERATELY STILL OUT, so the next person does not "fix" it:
--
--   VIDEO. Excluded on purpose and staying excluded. The bucket is 10 MB a file
--     on a free tier, and every view re-downloads through a fresh signed URL
--     that no CDN caches, so video costs egress every single time it is opened.
--     Link to YouTube instead.
--   MACRO-ENABLED OFFICE FILES (.docm, .xlsm, .pptm, and legacy .doc/.xls,
--     which can carry the same). A macro is a program, and a church passing one
--     between members is a phishing route with the church's name on it. The
--     modern formats added below cannot carry one.
--   application/octet-stream. It is what a browser sends when it has no idea
--     what a file is, so allowing it allows everything and there is no longer
--     an allow-list. The cost is real and accepted: a device that reports a
--     .docx as octet-stream is still refused. Better a narrow no than a wide
--     yes on a bucket holding private conversations.
update storage.buckets
set allowed_mime_types = array[
      -- Photographs, as before.
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      -- Documents.
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- .pptx
      'application/vnd.oasis.opendocument.text',         -- .odt
      'application/vnd.oasis.opendocument.spreadsheet',  -- .ods
      'application/vnd.oasis.opendocument.presentation', -- .odp
      'application/rtf',
      -- Voice notes, as before.
      'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
      -- Plain text and the one tabular format everything can read.
      'text/plain', 'text/csv', 'text/rtf'
    ]
where id = 'pairing-media';
