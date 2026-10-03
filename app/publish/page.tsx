// /publish IS HOME'S BLOG FOLDER NOW.
//
// Publish was a room of its own, for every role, from late September 2026. On
// 3 October the owner moved its two halves into Home: "Blog and announcement
// will be the sub rooms of home, so basically we will take out publish". Home
// (/church) has a Blog folder, with the writing desk above what people wrote,
// and an Announcements folder for those who pin notices.
//
// The address stays, because it is in people's bookmarks, in installed apps'
// history and in older messages, and a link that leads nowhere is worse than
// one that leads somewhere slightly different. `?room=` opens the folder
// (components/Rooms.tsx).

import { redirect } from 'next/navigation';

export default function PublishPage() {
  redirect('/church?room=blogs');
}
