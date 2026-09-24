import { STARTER_KIT } from '../starter-kit';
import type { DB } from '../types';

// Seed data for the demo. Fictional people, realistic story:
//  - 1 admin (Pastor Ramos)
//  - 2 missionaries (Maria, David), each with paired seekers at different stages
//  - 1 unapproved sign-up (Anna) waiting at the admin's approval gate
// Everything a client needs to click through all four roles in one sitting.

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

// Eight weeks of sample activity for the trend charts.
//
// Shaped by hand rather than randomised, so the demo tells the same story every
// time it is opened and a director can be walked through what they are seeing.
// Week 5 is deliberately empty: quiet weeks happen in real churches and the
// screen has to be able to say so.
function backfill(): DB['analytics'] {
  const now = Date.now();
  // The Monday that starts this week, so the events land in the same buckets
  // lib/analytics-trend.ts will draw. Spacing them by "seven times twenty-four
  // hours ago" instead put a week's worth of events across TWO Monday-aligned
  // buckets, which quietly filled in the quiet week this shape exists to show.
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
  const DAY = 24 * 60 * 60 * 1000;

  const shape: Array<[number, number, number]> = [
    // [weeks ago, actions that week, people moved forward that week]
    [7, 4, 0],
    [6, 6, 1],
    [5, 9, 1],
    [4, 0, 0],
    [3, 7, 1],
    [2, 12, 2],
    [1, 14, 2],
  ];
  const actors = ['dm-maria', 'dm-david', 'ds-john', 'ds-grace', 'ds-peter'];
  const kinds: Array<DB['analytics'][number]['type']> = [
    'signin',
    'message',
    'material_share',
    'material_open',
  ];
  const out: DB['analytics'] = [];
  let n = 0;
  const minutesAgo = (t: number) => Math.round((now - t) / 60000);

  for (const [weeksAgo, actions, advances] of shape) {
    const monday = thisMonday.getTime() - weeksAgo * 7 * DAY;
    for (let i = 0; i < actions; i++) {
      // Spread across that week's seven days rather than stacked on its Monday.
      const at = monday + Math.floor((i / Math.max(1, actions)) * 7 * DAY) + 10 * 60 * 60 * 1000;
      out.push({
        id: `bf${n++}`,
        user_id: actors[(i + weeksAgo) % actors.length],
        type: kinds[i % kinds.length],
        at: iso(minutesAgo(at)),
      });
    }
    for (let i = 0; i < advances; i++) {
      const at = monday + (2 + i) * DAY + 15 * 60 * 60 * 1000;
      out.push({
        id: `bf${n++}`,
        user_id: i % 2 === 0 ? 'dm-maria' : 'dm-david',
        type: 'stage_advance',
        at: iso(minutesAgo(at)),
      });
    }
  }
  return out;
}

export function makeSeed(): DB {
  return {
    profiles: [
      // The Executive Admin.
      //
      // This persona did not exist, which meant the client's executive
      // directors could not see their own view of Beacon even by choosing it:
      // the demo simply had no such account to sign in as. They were shown the
      // admin's screens or the missionary's, and left to imagine the rest.
      {
        id: 'exec-1',
        role: 'executive',
        full_name: 'Bishop Alonzo',
        preferred_contact: 'bishop@church.example',
        gender: 'Male',
        status: 'Executive Support',
        topics_of_interest: [],
        city_of_residence: 'Cavite',
        work_industry: 'Ministry',
        preferred_language: 'en',
        avatar: '⛪',
        is_approved: true,
        created_at: iso(60 * 24 * 40),
      },
      {
        id: 'admin-1',
        role: 'admin',
        full_name: 'Pastor Ramos',
        preferred_contact: 'pastor@church.example',
        gender: 'Male',
        status: 'Church coordinator',
        topics_of_interest: [],
        city_of_residence: 'Cavite',
        work_industry: 'Ministry',
        preferred_language: 'en',
        avatar: '🛡️',
        is_approved: true,
        created_at: iso(60 * 24 * 30),
      },
      {
        id: 'dm-maria',
        role: 'dm',
        full_name: 'Maria Santos',
        preferred_contact: 'maria@church.example',
        birthday: '1979-04-12',
        gender: 'Female',
        status: 'Member',
        topics_of_interest: ['Health', 'Bible study', 'Family'],
        city_of_residence: 'Cavite',
        work_industry: 'Nursing',
        preferred_language: 'en',
        is_approved: true,
        created_at: iso(60 * 24 * 20),
      },
      {
        id: 'dm-david',
        role: 'dm',
        full_name: 'David Cruz',
        preferred_contact: 'david@church.example',
        gender: 'Male',
        status: 'Member',
        topics_of_interest: ['Prophecy', 'Youth'],
        city_of_residence: 'Manila',
        work_industry: 'Teaching',
        preferred_language: 'en',
        is_approved: true,
        created_at: iso(60 * 24 * 20),
      },
      {
        id: 'ds-john',
        role: 'ds',
        full_name: 'John Reyes',
        preferred_contact: 'Messenger',
        birthday: '1991-09-02',
        gender: 'Male',
        status: 'Exploring',
        topics_of_interest: ['Purpose of life', 'Stress'],
        city_of_residence: 'Cavite',
        work_industry: 'Call center',
        preferred_language: 'en',
        is_approved: true,
        created_at: iso(60 * 24 * 12),
      },
      {
        id: 'ds-grace',
        role: 'ds',
        full_name: 'Grace Lim',
        preferred_contact: 'Phone',
        gender: 'Female',
        status: 'Attending online',
        topics_of_interest: ['Health', 'Prayer'],
        city_of_residence: 'Cavite',
        work_industry: 'Retail',
        preferred_language: 'en',
        is_approved: true,
        created_at: iso(60 * 24 * 9),
      },
      {
        id: 'ds-peter',
        role: 'ds',
        full_name: 'Peter Tan',
        preferred_contact: 'Email',
        gender: 'Male',
        status: 'Ready to decide',
        topics_of_interest: ['Prophecy', 'Baptism'],
        city_of_residence: 'Manila',
        work_industry: 'Logistics',
        preferred_language: 'en',
        is_approved: true,
        created_at: iso(60 * 24 * 6),
      },
      {
        id: 'ds-anna',
        role: 'ds',
        full_name: 'Anna Yu',
        preferred_contact: 'Messenger',
        topics_of_interest: ['Anxiety', 'Meaning'],
        city_of_residence: 'Quezon City',
        preferred_language: 'en',
        is_approved: false, // waiting at the admin's approval gate
        created_at: iso(45),
      },
    ],
    pairings: [
      {
        id: 'pair-john',
        dm_id: 'dm-maria',
        ds_id: 'ds-john',
        track: 'digital',
        journey_stage: 'connect',
        status: 'active',
        created_at: iso(60 * 24 * 12),
      },
      {
        id: 'pair-grace',
        dm_id: 'dm-maria',
        ds_id: 'ds-grace',
        track: 'traditional',
        journey_stage: 'care',
        status: 'active',
        created_at: iso(60 * 24 * 9),
      },
      {
        id: 'pair-peter',
        dm_id: 'dm-david',
        ds_id: 'ds-peter',
        track: 'digital',
        journey_stage: 'call',
        status: 'active',
        created_at: iso(60 * 24 * 6),
      },
    ],
    messages: [
      {
        id: 'm1',
        pairing_id: 'pair-john',
        sender_id: 'dm-maria',
        body: 'Hi John! So glad you reached out. How are you doing this week?',
        created_at: iso(60 * 20),
        read_at: iso(60 * 19),
      },
      {
        id: 'm2',
        pairing_id: 'pair-john',
        sender_id: 'ds-john',
        body: 'Doing okay, a bit stressed with work. Been thinking about the things we talked about.',
        created_at: iso(60 * 18),
        read_at: iso(60 * 17),
      },
      {
        id: 'm3',
        pairing_id: 'pair-john',
        sender_id: 'dm-maria',
        body: 'That is completely understandable. I shared a short reading on rest. No rush, whenever you have a quiet moment.',
        created_at: iso(60 * 17),
      },
      // Deliberately left unread: this is what lights the unread badge on
      // Maria's dashboard and clears once she opens the conversation.
      {
        id: 'm5',
        pairing_id: 'pair-john',
        sender_id: 'ds-john',
        body: 'I read it, and the part about rest really landed. Could we talk this week?',
        created_at: iso(60 * 2),
      },
      {
        id: 'm4',
        pairing_id: 'pair-peter',
        sender_id: 'ds-peter',
        body: 'I think I am ready to take the next step. Can we talk about baptism?',
        created_at: iso(60 * 3),
      },
    ],
    materials: STARTER_KIT,
    material_shares: [
      {
        id: 'sh1',
        material_id: 'kit-egw-sc',
        pairing_id: 'pair-john',
        shared_by: 'dm-maria',
        note: 'This one is short, and it helped me when I started out.',
        created_at: iso(60 * 17),
      },
      {
        id: 'sh2',
        material_id: 'kit-ss-current',
        pairing_id: 'pair-grace',
        shared_by: 'dm-maria',
        created_at: iso(60 * 24 * 3),
      },
    ],
    journey_events: [
      {
        id: 'j1',
        pairing_id: 'pair-john',
        from_stage: 'create',
        to_stage: 'connect',
        changed_by: 'dm-maria',
        created_at: iso(60 * 24 * 8),
      },
      {
        id: 'j2',
        pairing_id: 'pair-grace',
        from_stage: 'connect',
        to_stage: 'care',
        changed_by: 'dm-maria',
        created_at: iso(60 * 24 * 4),
      },
      {
        id: 'j3',
        pairing_id: 'pair-peter',
        from_stage: 'care',
        to_stage: 'call',
        changed_by: 'dm-david',
        created_at: iso(60 * 24 * 2),
      },
    ],
    notifications: [
      {
        id: 'n1',
        user_id: 'ds-john',
        type: 'material',
        title: 'Maria shared a reading with you',
        body: 'Steps to Christ (PDF)',
        created_at: iso(60 * 17),
      },
      {
        id: 'n2',
        user_id: 'dm-david',
        type: 'message',
        title: 'New message from Peter Tan',
        created_at: iso(60 * 3),
      },
      {
        id: 'n3',
        user_id: 'admin-1',
        type: 'approval',
        title: 'New sign-up awaiting approval',
        body: 'Anna Yu',
        created_at: iso(45),
      },
    ],
    // A little seeded activity so the Admin analytics view has a story on first
    // open. New actions append here as people use the app.
    analytics: [
      { id: 'a1', user_id: 'dm-maria', type: 'signin', at: iso(60 * 22) },
      { id: 'a2', user_id: 'dm-maria', type: 'message', at: iso(60 * 20) },
      { id: 'a3', user_id: 'ds-john', type: 'message', at: iso(60 * 18) },
      { id: 'a4', user_id: 'dm-maria', type: 'material_share', at: iso(60 * 17) },
      { id: 'a5', user_id: 'ds-john', type: 'material_open', at: iso(60 * 16) },
      { id: 'a6', user_id: 'dm-david', type: 'stage_advance', at: iso(60 * 24 * 2) },
      { id: 'a7', user_id: 'dm-maria', type: 'stage_advance', at: iso(60 * 24 * 4) },
      { id: 'a8', user_id: 'ds-peter', type: 'message', at: iso(60 * 3) },
      // Two months of history, so "activity over time" has something to show.
      //
      // Without it the chart was eight bars, seven of them empty, which taught a
      // church director nothing except that the feature exists. This is a story
      // rather than noise: a quiet start, a push through the middle, one week
      // where nothing happened at all, and a recovery. The quiet week is there
      // on purpose — a chart that only ever goes up is not a chart anybody needs
      // to learn how to read.
      ...backfill(),
    ],
    // A seeker's own study shelf — their notes and media, which they control.
    // Empty on purpose. A seeded attachment would be a row whose bytes were
    // never written to IndexedDB, which renders as a permanently broken file
    // that nobody can explain. Attachments only exist once somebody adds one.
    pairing_media: [],
    seeker_media: [
      {
        id: 'sm1',
        ds_id: 'ds-john',
        title: 'My notes on Psalm 23',
        type: 'pdf',
        note: 'Wrote down what “I shall not want” means to me.',
        created_at: iso(60 * 10),
      },
      {
        id: 'sm2',
        ds_id: 'ds-john',
        title: 'Question about the Sabbath',
        type: 'link',
        note: 'Found this while reading, want to ask Maria.',
        external_url: 'https://www.bibleinfo.com/',
        created_at: iso(60 * 5),
      },
    ],
    prayer_requests: [
      {
        id: 'pr1',
        ds_id: 'ds-john',
        author_id: 'ds-john',
        body: 'Please pray for my mother, she is unwell.',
        share_with_board: true,
        status: 'praying',
        created_at: iso(60 * 14),
      },
      {
        id: 'pr2',
        ds_id: 'ds-grace',
        author_id: 'ds-grace',
        body: 'Praying for peace and direction in a big decision.',
        share_with_board: true,
        status: 'open',
        created_at: iso(60 * 6),
      },
      // Prayer runs both ways: John's Guide has asked him to pray for her.
      // Never on the wall -- a Guide's ask goes to the one person asked.
      {
        id: 'pr3',
        ds_id: 'ds-john',
        author_id: 'dm-maria',
        body: 'I am leading the youth retreat this weekend. Please pray I have the right words.',
        share_with_board: false,
        status: 'open',
        created_at: iso(60 * 3),
      },
    ],
    // One ready-made series, so the feature is visible the moment somebody
    // opens the demo rather than only after an admin has built one.
    lesson_series: [
      {
        id: 'series-prayer',
        title: 'Learning to pray',
        description:
          'Four short lessons for someone who wants to pray but is not sure how to start.',
        topic: 'Prayer',
        lesson_ids: ['l-connect-2', 'l-care-1', 'l-cult-1', 'l-comm-1'],
        is_published: true,
        created_at: iso(60 * 24 * 12),
      },
      {
        id: 'series-bible',
        title: 'Opening the Bible',
        description: 'Where to begin, and what the book actually is.',
        topic: 'Understanding the Bible',
        lesson_ids: ['l-create-2', 'l-create-1', 'l-connect-1'],
        is_published: true,
        created_at: iso(60 * 24 * 9),
      },
    ],
    lesson_assignments: [
      {
        id: 'la1',
        pairing_id: 'pair-john',
        lesson_id: 'l-connect-1',
        status: 'completed',
        created_at: iso(60 * 24 * 2),
        completed_at: iso(60 * 20),
      },
      {
        id: 'la2',
        pairing_id: 'pair-john',
        lesson_id: 'l-connect-2',
        status: 'assigned',
        created_at: iso(60 * 24),
      },
    ],
    meetings: [
      {
        id: 'mt1',
        pairing_id: 'pair-john',
        title: 'Bible study over coffee',
        when: new Date(now + 20 * 60 * 60_000).toISOString(),
        mode: 'in_person',
        location: 'Church café',
        created_by: 'dm-maria',
        status: 'scheduled',
        created_at: iso(60 * 5),
      },
    ],
    recommendations: [
      // One waiting, because the admin walk asks the person to act on a
      // recommendation and an empty list would have made that step impossible
      // to finish. This is also the newest part of the app and the piece an
      // admin is least likely to discover on their own.
      {
        id: 'rec-1',
        dm_id: 'dm-maria',
        full_name: 'Elena Marquez',
        email: 'elena.marquez@example.com',
        note: 'Met at the Tuesday feeding programme. Asked if someone could study with her.',
        status: 'pending',
        created_at: iso(60 * 20),
      },
    ],
    invites: [
      {
        id: 'inv1',
        token: 'demo-invite-ruth',
        email: 'ruth.bautista@example.com',
        full_name: 'Ruth Bautista',
        role: 'ds',
        invited_by: 'admin-1',
        status: 'pending',
        created_at: iso(60 * 2),
      },
    ],
    // A missionary's private journal. Only ever visible to the author — Maria
    // here — which is why every entry is scoped by author_id as well as pairing.
    seeker_notes: [
      {
        id: 'sn1',
        pairing_id: 'pair-john',
        author_id: 'dm-maria',
        body: 'His mother is in hospital again. Don’t push the next lesson this week, just check in.',
        created_at: iso(60 * 14),
      },
      {
        id: 'sn2',
        pairing_id: 'pair-john',
        author_id: 'dm-maria',
        body: 'Asked a sharp question about the Sabbath. Bring the study guide next time.',
        created_at: iso(60 * 5),
      },
      {
        id: 'sn3',
        pairing_id: 'pair-grace',
        author_id: 'dm-maria',
        body: 'Prefers to meet in person, and finds messaging hard. Call rather than type.',
        created_at: iso(60 * 24 * 3),
      },
    ],
    // Reminders the missionary set for herself. One already overdue and one due
    // today, so the dashboard's triage chips have something real to count.
    follow_ups: [
      {
        id: 'fu1',
        pairing_id: 'pair-john',
        owner_id: 'dm-maria',
        title: 'Call about his mother',
        due_on: dateKey(-2),
        created_at: iso(60 * 24 * 4),
      },
      {
        id: 'fu2',
        pairing_id: 'pair-john',
        owner_id: 'dm-maria',
        title: 'Bring the Sabbath study guide',
        due_on: dateKey(3),
        created_at: iso(60 * 5),
      },
      {
        id: 'fu3',
        pairing_id: 'pair-grace',
        owner_id: 'dm-maria',
        title: 'Ring her, she doesn’t like messaging',
        due_on: dateKey(0),
        created_at: iso(60 * 24 * 2),
      },
      {
        id: 'fu4',
        pairing_id: 'pair-peter',
        owner_id: 'dm-david',
        title: 'Send the baptism reading list',
        due_on: dateKey(1),
        created_at: iso(60 * 24),
      },
    ],
    // One message already "sent", so the Outbox shows what an invitation looks
    // like before you create your first one.
    emails: [
      {
        id: 'em1',
        to: 'ruth.bautista@example.com',
        to_name: 'Ruth Bautista',
        from: 'no-reply@beacon.app',
        from_name: 'Grace SDA Church',
        subject: "You're invited to join Grace SDA Church on Beacon",
        kind: 'invite',
        link: '/join?token=demo-invite-ruth',
        body:
          'Hello Ruth,\n\n' +
          'Grace SDA Church has invited you to join Beacon.\n\n' +
          'Beacon is a private, invitation-only app that walks you through a ' +
          'journey of faith alongside someone from the church.\n\n' +
          "Tap the button below to set your password and finish signing up. " +
          "This link is just for you, please don't forward it.",
        created_at: iso(60 * 2),
      },
      {
        id: 'em2',
        to: 'pastor@church.example',
        to_name: 'Pastor Ramos',
        to_user_id: 'admin-1',
        from: 'maria@church.example',
        from_name: 'Maria Santos',
        from_user_id: 'dm-maria',
        subject: "Please review Anna Yu's sign-up",
        kind: 'recommendation',
        about_profile_id: 'ds-anna',
        suggested_role: 'ds',
        body:
          'Hello Pastor,\n\n' +
          'Maria Santos (Guide) is asking you to review Anna Yu\'s ' +
          'sign-up, suggesting they join the church\'s Beacon.\n\n' +
          '"She came to the Sabbath programme twice and asked to be paired with ' +
          'someone. I know the family."\n\n' +
          'You can approve or decline Anna from this message.',
        created_at: iso(60 * 1),
      },
    ],
    // A Guide's blog. One published post everybody paired with Maria can read,
    // one draft only she can see — so the private/published switch is visible
    // in the sample data rather than something you have to create to believe.
    blog_posts: [
      {
        id: 'blog-sabbath',
        author_id: 'dm-maria',
        title: 'What I keep coming back to in Psalm 23',
        body:
          'Someone asked me this week why the psalm says "I shall not want" '
          + 'when plainly we do want things, most of the time.\n\n'
          + 'I do not think it is saying the wanting stops. I think it is saying '
          + 'who is doing the leading. A shepherd walks ahead. The sheep does '
          + 'not need the whole map, only to keep the shepherd in sight.\n\n'
          + 'So if this week has been the kind where you cannot see very far '
          + 'ahead, that is alright. That is most weeks for me. Keep your eyes '
          + 'on Jesus and take the next step.',
        visibility: 'published',
        audience: 'all',
        created_at: iso(60 * 26),
      },
      {
        id: 'blog-draft',
        author_id: 'dm-maria',
        title: 'Notes for Sabbath, not finished',
        body: 'Three things on hospitality. Still working out the second one.',
        visibility: 'private',
        audience: 'all',
        created_at: iso(60 * 3),
      },
    ],
    blog_audience: [],
    // Two people have read the published post. The Guide is shown "2 readers"
    // and never which two — see the note on BlogView in lib/types.ts.
    blog_views: [
      { id: 'view-1', post_id: 'blog-sabbath', viewer_id: 'ds-john', created_at: iso(60 * 20) },
      { id: 'view-2', post_id: 'blog-sabbath', viewer_id: 'ds-grace', created_at: iso(60 * 9) },
    ],
    // Empty on purpose. A safeguarding report is somebody's real complaint
    // about a real person, and a fake one sitting in the Directors' queue on
    // first run teaches a church to scroll past that queue.
    reports: [],
    church_name: 'Grace SDA Church',
  };
}

// A plain YYYY-MM-DD date, N days from today in local time. Follow-up dates
// carry no time of day, so they must be built the same way they are compared
// (see todayKey in lib/engagement.ts) or they tip a day either side of UTC.
function dateKey(offsetDays: number): string {
  const d = new Date(now + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
