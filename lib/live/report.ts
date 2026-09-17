// The church report, described ONCE and rendered five ways.
//
// WHY A DESCRIPTION RATHER THAN FIVE EXPORT FUNCTIONS. A church takes these
// numbers to a board meeting, and the CSV, the spreadsheet, the document and
// the PDF have to agree with the screen and with each other. Written five
// times they would agree on the day they were written; someone then adds a
// column to the CSV, and a year later the PDF a treasurer is holding says
// something the spreadsheet does not.
//
// So the report is DATA. Each renderer walks the same structure and does
// nothing but formatting.
//
// EVERY FORMAT CARRIES THE SAME EXPLANATION, and that is the point of putting
// the notes in the structure rather than on the screen. A spreadsheet with a
// column headed "Active" and no definition beside it is how somebody decides
// that eleven of nineteen Guides are not working. The word means "the app
// recorded them doing something", it does not mean visits, and that sentence
// has to travel with the number into whatever file it ends up in.

export type Cell = string | number;

export interface ReportTable {
  title: string;
  /** What this table answers, in a sentence a pastor can read aloud. */
  blurb: string;
  headers: string[];
  rows: Cell[][];
  /** Caveats that must survive being pasted into a slide. */
  notes?: string[];
}

export interface ReportSection {
  heading: string;
  paragraphs?: string[];
  tables?: ReportTable[];
}

export interface Report {
  /** "Hope Beacon" and the church, for the cover line. */
  app: string;
  church: string;
  /** When it was made. A report with no date is a report nobody can place. */
  generated: string;
  title: string;
  subtitle: string;
  sections: ReportSection[];
  /** Printed at the foot of every format. */
  footer: string[];
}

const stamp = () =>
  new Date().toLocaleString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

/** The standing notes. Written once so five formats cannot drift apart. */
export const ACTIVE_MEANS =
  'Active means Beacon recorded this person doing something in the period: '
  + 'sending a message, a step on a journey, arranging a meeting, or writing a '
  + 'post or a study. It is NOT a count of visits. Beacon does not record when '
  + 'somebody opens the app, so any number presented as visits would be invented.';

export const NOT_A_FAILURE =
  'Somebody in the "nothing recorded" column is not necessarily inactive. An '
  + 'Explorer who met their Guide for coffee and wrote nothing down appears '
  + 'there. What is worth acting on is a whole month with nothing recorded for '
  + 'one person, and any Explorer waiting for a Guide.';

export const REMOVED_IS_DELETED =
  'Removing somebody from the church deletes their account, so "removed" and '
  + '"deleted" are one number. There is no state in this app where a person has '
  + 'been put out but still has a login.';

export const NO_NAMES =
  'This report contains counts only. No member name, message, prayer request or '
  + 'private note appears anywhere in it, in any format.';

export function buildReport(input: {
  church?: string | null;
  headline: { explorers: number; guides: number; graduated: number; unpaired: number };
  activity: { role: string; windowLabel: string; approved: number; active: number; inactive: number; suspended: number }[];
  grainLabel: string;
  arrivalLabels: string[];
  arrivals: { label: string; points: number[]; total: number }[];
  departures?: {
    approved: number; disapproved: number; suspended: number;
    released: number; removed: number; since: string;
  };
}): Report {
  const church = input.church?.trim() || 'Your church';

  const sections: ReportSection[] = [
    {
      heading: 'Where the church is now',
      paragraphs: [
        'Four numbers, counted at the moment this report was made. Everything '
        + 'below describes movement; these describe the present.',
      ],
      tables: [{
        title: 'Today',
        blurb: 'The people in the church, and the one number that means somebody is being ignored.',
        headers: ['Measure', 'Count', 'What it means'],
        rows: [
          ['Explorers', input.headline.explorers, 'Approved members walking the journey.'],
          ['Guides', input.headline.guides, 'Approved members carrying at least one person.'],
          ['Graduated', input.headline.graduated, 'Reached Commission: walked the whole journey and now sent to walk with somebody else.'],
          ['Waiting for a Guide', input.headline.unpaired,
            input.headline.unpaired > 0
              ? 'ACT ON THIS FIRST. An Explorer with no Guide has been invited into an app where nothing happens.'
              : 'Everybody is paired.'],
        ],
        notes: [
          'The limit on this church is Guides, not servers. A Guide carries at '
          + 'most as many Explorers as this church has set, enforced in the '
          + 'database rather than on a screen. Growth is recruiting and training '
          + 'a Guide, not buying anything: a Guide with ninety people is a '
          + 'number, not a discipleship relationship.',
        ],
      }],
    },
    {
      heading: 'Who is using it',
      paragraphs: [
        'Of everybody on the roll for each role, how many the app recorded doing '
        + 'something over three periods.',
      ],
      tables: [{
        title: 'Active and not recorded, by role and period',
        blurb: 'Read the week and the month. Today is almost always low, and that is the day rather than the church.',
        headers: ['Role', 'Period', 'On the roll', 'Active', 'Nothing recorded', 'Suspended'],
        rows: input.activity.map((a) => [
          a.role, a.windowLabel, a.approved, a.active, a.inactive, a.suspended,
        ]),
        notes: [ACTIVE_MEANS, NOT_A_FAILURE],
      }],
    },
    {
      heading: 'Who is arriving',
      paragraphs: [
        `New members by role, ${input.grainLabel.toLowerCase()}. Somebody counts as `
        + 'arriving on the day they finished signing up, not the day their '
        + 'invitation was sent: an invitation that sat unopened for three weeks '
        + 'would otherwise land in the wrong period.',
      ],
      tables: [{
        title: `Arrivals (${input.grainLabel})`,
        blurb: 'One row per role, one column per period, oldest on the left.',
        headers: ['Role', ...input.arrivalLabels, 'Total'],
        rows: input.arrivals.map((p) => [
          p.label, ...p.points.map((n) => n), p.total,
        ]),
        notes: [
          'The last column of the chart on screen is the period you are IN, so '
          + 'it is always partly finished and always looks low. Compare the two '
          + 'before it.',
        ],
      }],
    },
  ];

  if (input.departures) {
    const d = input.departures;
    sections.push({
      heading: 'Decisions the church made',
      paragraphs: [
        `Recorded since ${d.since}. Taken from the discipline record, which `
        + 'outlives the people in it: that is the point of keeping it, and why '
        + 'these numbers survive a deletion.',
      ],
      tables: [{
        title: 'Decisions about people',
        blurb: 'Every decision, not only the refusals. A record of only the punishments reads like a charge sheet.',
        headers: ['Decision', 'Count'],
        rows: [
          ['Let in', d.approved],
          ['Turned down', d.disapproved],
          ['Suspended', d.suspended],
          ['Suspension lifted', d.released],
          ['Removed and deleted', d.removed],
        ],
        notes: [REMOVED_IS_DELETED],
      }],
    });
  }

  sections.push({
    heading: 'How to use this',
    paragraphs: [
      'Read it in this order: is anybody waiting for a Guide, is the month’s '
      + 'activity roughly what last month was, and did more people arrive than '
      + 'left. Three questions, and the first one is the only one that is '
      + 'urgent on any given week.',
      'A flat month is not a failure. A church of forty is not supposed to be '
      + 'busy every week, and treating steady as bad is how people get chased '
      + 'for numbers instead of walked with.',
      'If you take one figure to a board meeting, take the number waiting for a '
      + 'Guide. It is the only one that names something nobody is doing.',
    ],
  });

  return {
    app: 'Hope Beacon',
    church,
    generated: stamp(),
    title: 'Church report',
    subtitle: `${church} · counts only, no names`,
    sections,
    footer: [
      NO_NAMES,
      'Made by Hope Beacon. Figures are counted at the moment the file is made, '
      + 'so two reports made on different days will differ.',
    ],
  };
}
