import type { Material } from './types';

// The starter toolkit — every account gets this, Executive down to Digital Seeker.
//
// These are REAL published resources from the official free sources, not sample
// rows. Beacon does not host any of them: each entry is a link to the publisher
// that already gives it away for free, which is why this costs nothing to run
// and why nothing here infringes anyone's copyright. The KJV text and the older
// Ellen G. White books are public domain; the Sabbath School guides and the
// statements of belief are published free by the denomination itself.
//
// To keep a copy for offline use: open the item, let the browser download it,
// then add it with "Upload files" on this page. It is then stored on the device
// in IndexedDB and works with no signal.
//
// ponytail: a flat constant, not a table. It is the same list for everyone, it
// changes about once a year, and a constant costs no storage and no query. If a
// church ever needs its own toolkit, promote this to `materials` rows then.

const ADDED = '2026-07-29T00:00:00.000Z';

// EVERY ADDRESS IN HERE MUST BE OPENED BEFORE IT IS COMMITTED.
//
// Eight resources were added on 1 September from a sandbox with no route to the
// open internet, so not one of the addresses could be opened. Four of the eight
// were wrong, and a church member found them: `www.jesus101.tv` (the site has no
// `www.`), `media3` for The Desire of Ages (it is on `media2`, and the subdomain
// differs per book), `vop.com` (Voice of Prophecy is `voiceofprophecy.com`), and
// `youth.adventist.org` (Youth Ministries is `gcyouthministries.org`).
//
// A plausible-looking address is not a checked one. `links.yml` now runs on
// every push that touches this file, so a wrong address is caught by CI within
// a minute instead of by an Explorer on their first day.

export const STARTER_KIT: Material[] = [
  // ---- The Bible ----
  {
    id: 'kit-bible-youversion',
    title: 'The Bible, free, with offline download',
    description:
      'YouVersion’s King James Version. Free to read online, and the app lets you download whole books to read with no signal.',
    type: 'link',
    external_url: 'https://www.bible.com/versions/1-kjv-king-james-version',
    topics: ['Bible'],
    is_published: true,
    created_at: ADDED,
  },
  // THE KJV AS ONE PDF WAS HERE, and it is gone on purpose. Its publisher's
  // address answered 400 on 21 and 28 September 2026 -- a dead end on the shelf
  // for two weeks -- and a replacement could not be opened from the sandbox that
  // made this change, which is exactly how four wrong addresses went out on
  // 1 September (see above). The Bible is still first on the shelf, twice:
  // YouVersion above, with its offline download, and King James Bible Online
  // below. A PDF can come back once somebody has opened its address.
  {
    id: 'kit-bible-online',
    title: 'King James Bible Online',
    description:
      'Read and search the 1611 and 1769 King James text in a browser, verse by verse.',
    type: 'link',
    external_url: 'https://www.kingjamesbibleonline.org/',
    topics: ['Bible'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- Ellen G. White ----
  {
    id: 'kit-egw-library',
    title: 'Ellen G. White Writings: the complete library',
    description:
      'The Ellen G. White Estate’s official site. Her complete published writings, free to read and download in several formats and many languages.',
    type: 'link',
    external_url: 'https://egwwritings.org/',
    topics: ['Ellen G. White', 'Devotional'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-egw-sc',
    title: 'Steps to Christ (PDF)',
    description:
      'The short classic on coming to Christ, and the most widely translated of her books. Public domain.',
    type: 'pdf',
    external_url: 'https://media3.egwwritings.org/pdf/en_SC.pdf',
    topics: ['Ellen G. White', 'Devotional', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-egw-gc',
    title: 'The Great Controversy, 1911 edition (PDF)',
    description:
      'The full prophetic history, from the fall of Jerusalem to the end of the great controversy. Public domain.',
    type: 'pdf',
    external_url: 'https://media4.egwwritings.org/pdf/en_GC.pdf',
    topics: ['Ellen G. White', 'Prophecy'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- What the church teaches ----
  {
    id: 'kit-beliefs',
    title: 'What Seventh-day Adventists Believe',
    description:
      'The General Conference’s own summary of the 28 fundamental beliefs, with the scripture behind each one.',
    type: 'link',
    external_url: 'https://gc.adventist.org/beliefs/',
    topics: ['Beliefs', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-beliefs-pdf',
    title: 'The 28 Fundamental Beliefs (PDF)',
    description: 'All 28 statements in one printable document.',
    type: 'pdf',
    external_url:
      'https://szu.adventist.org/wp-content/uploads/2016/04/28_Beliefs.pdf',
    topics: ['Beliefs'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- Sabbath School ----
  {
    id: 'kit-ss-current',
    title: 'Sabbath School: this quarter’s lesson',
    description:
      'The current Adult Bible Study Guide: weekly lessons with reading, audio, video and PDF.',
    type: 'link',
    external_url: 'https://www.sabbath.school/',
    topics: ['Sabbath School', 'Bible study'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-ss-net',
    title: 'Sabbath School Net: study guides',
    description:
      'Lesson helps, commentary and discussion for the current and past quarters.',
    type: 'link',
    external_url: 'https://ssnet.org/study-guides/',
    topics: ['Sabbath School', 'Bible study'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-ss-archive',
    title: 'Sabbath School lesson archive',
    description:
      'Adventist Archives’ scanned back-catalogue of Adult Sabbath School Bible Study Guides, free as PDFs.',
    type: 'link',
    external_url: 'https://www.adventistarchives.org/sabbathschoollessons',
    topics: ['Sabbath School', 'Archive'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-gc-publications',
    title: 'General Conference publications',
    description:
      'Official church publications, reports and resources, free to download.',
    type: 'link',
    external_url: 'https://gc.adventist.org/publications/',
    topics: ['Church', 'Archive'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- Jesus first ----
  //
  // The kit began as a reference shelf: three Bibles, the collected Ellen White,
  // the prophetic history, the statements of belief, the quarterly and its
  // archive. Right for a Director preparing a study. Wrong as the first thing an
  // Explorer sees, which is why the Explorer list below is short and starts
  // here. Somebody meeting Jesus for the first time does not need the archive.
  {
    id: 'kit-jesus-101',
    title: 'Jesus 101',
    description:
      'Short studies and broadcasts about Jesus, from the Gospels outward. Made for people who are meeting him for the first time.',
    type: 'link',
    external_url: 'https://jesus101.tv/',
    topics: ['Jesus', 'New believer', 'Devotional'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-egw-da',
    title: 'The Desire of Ages (PDF)',
    description:
      'The life of Christ, told from beginning to end. The best-loved of her books, and the one to read before The Great Controversy. Public domain.',
    type: 'pdf',
    external_url: 'https://media2.egwwritings.org/pdf/en_DA.pdf',
    topics: ['Jesus', 'Ellen G. White', 'Devotional', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-bibleproject',
    title: 'BibleProject: every book, explained in a few minutes',
    description:
      'Free animated videos that walk through each book of the Bible and how it points to Jesus. If reading a whole book feels like too much to start with, start here.',
    type: 'link',
    external_url: 'https://bibleproject.com/',
    topics: ['Jesus', 'Bible', 'Youth', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-discover-guides',
    title: 'Discover Bible Guides',
    description:
      'A free guided course through the Bible, one short lesson at a time, at your own pace. Voice of Prophecy.',
    type: 'link',
    external_url: 'https://www.voiceofprophecy.com/study/discover',
    topics: ['Bible study', 'New believer', 'Youth'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-bibleinfo',
    title: 'Bible answers to ordinary questions',
    description:
      'Plain answers to the questions people actually ask about suffering, death, forgiveness and the Sabbath, each one answered from Scripture.',
    type: 'link',
    external_url: 'https://www.bibleinfo.com/',
    topics: ['Beliefs', 'New believer', 'Bible study'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-amazing-facts',
    title: 'Amazing Facts Bible study guides',
    description:
      'Free illustrated Bible studies you can work through on a phone, covering the questions a new believer meets first.',
    type: 'link',
    external_url: 'https://www.amazingfacts.org/',
    topics: ['Bible study', 'New believer', 'Youth'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-hope-channel',
    title: 'Hope Channel',
    description:
      'Free programmes to watch: Bible study, music, and honest conversation about faith and everyday life.',
    type: 'link',
    external_url: 'https://www.hopetv.org/',
    topics: ['Youth', 'Devotional', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-adventist-youth',
    title: 'Adventist Youth Ministries',
    description:
      'What young Adventists are doing around the world, and how to join in locally.',
    type: 'link',
    external_url: 'https://www.gcyouthministries.org/',
    topics: ['Youth', 'Church'],
    is_published: true,
    created_at: ADDED,
  },
];

// Every topic in the kit, for filter chips. Sorted so the order is stable.
export const KIT_TOPICS: string[] = Array.from(
  new Set(STARTER_KIT.flatMap((m) => m.topics)),
).sort();


// ---------------------------------------------------------------------------
// The short list an Explorer starts with.
//
// WHY THIS IS SHORTER RATHER THAN DIFFERENT. Everything an Explorer can see, a
// Guide can see too; nothing is hidden from anybody who asks. What changes is
// what is put in front of somebody on their first day. Nineteen items, opening
// with two editions of the Bible and closing with a lesson archive going back
// decades, is a filing cabinet. It answers questions nobody has asked yet.
//
// So this list is ordered the way a first conversation goes: a Bible you can
// actually read on a phone, then Jesus, then Jesus again, then a way into
// studying for yourself — and only then what this church teaches and what it is
// studying together this quarter. One doctrinal page, deliberately. A person
// deciding whether to follow Jesus is not helped by being handed the full
// twenty-eight on day one, and the Guide walking with them is the right way to
// meet the rest.
//
// The Great Controversy, the collected writings, the quarterly archive and the
// General Conference publications are all still there for everyone else, and
// for an Explorer the moment they go looking.
const EXPLORER_START: readonly string[] = [
  'kit-bible-youversion',
  'kit-jesus-101',
  'kit-egw-da',
  'kit-egw-sc',
  'kit-bibleproject',
  'kit-discover-guides',
  'kit-beliefs',
  'kit-ss-current',
];

/**
 * The starter shelf as this person should first meet it.
 *
 * Explorers get the short list above, in that order. Everybody else gets the
 * whole kit — a Guide choosing what to send needs the archive, and a Director
 * stocking the church's own shelf needs all of it.
 */
export function starterKitFor(role: string | null | undefined): Material[] {
  if (role !== 'ds') return STARTER_KIT;
  const byId = new Map(STARTER_KIT.map((m) => [m.id, m]));
  return EXPLORER_START.map((id) => byId.get(id)).filter((m): m is Material => !!m);
}
