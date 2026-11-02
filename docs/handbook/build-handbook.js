const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  LevelFormat, PageBreak, TableOfContents,
} = require('docx');
const fs = require('fs');

const NAVY='1B2A4A', GOLD='C9A227', GREY='5A6472', LIGHT='F2F4F7', MONO='Consolas';

const P = (text, opts={}) => new Paragraph({ spacing:{after:130},
  children:[new TextRun({ text, size:21, color:'222833', ...opts })] });
const Bullet = (text) => new Paragraph({ numbering:{reference:'dots',level:0}, spacing:{after:90},
  children:[new TextRun({ text, size:21 })] });
const Num = (text) => new Paragraph({ numbering:{reference:'steps',level:0}, spacing:{after:90},
  children:[new TextRun({ text, size:21 })] });
const Code = (lines) => new Paragraph({ spacing:{before:90,after:170},
  shading:{type:ShadingType.CLEAR, fill:LIGHT},
  border:{ left:{style:BorderStyle.SINGLE, size:12, color:GOLD, space:8} },
  children: lines.flatMap((l,i)=>[ ...(i?[new TextRun({break:1})]:[]),
    new TextRun({ text:l, font:MONO, size:18, color:'20262F' }) ]) });
const Rule = () => new Paragraph({ spacing:{before:60,after:200},
  border:{ bottom:{style:BorderStyle.SINGLE, size:6, color:'D8DCE3', space:2} },
  children:[new TextRun({text:''})] });
const Note = (label, text) => new Paragraph({ spacing:{before:130,after:190},
  shading:{type:ShadingType.CLEAR, fill:'FFF8E1'},
  border:{ left:{style:BorderStyle.SINGLE, size:14, color:GOLD, space:10} },
  children:[ new TextRun({ text:`${label}  `, bold:true, size:21, color:'7A5C00' }),
             new TextRun({ text, size:21, color:'4A3B00' }) ] });
const Break = () => new Paragraph({ children:[new PageBreak()] });
const Lead = (t) => new Paragraph({spacing:{after:200},children:[new TextRun({text:t,size:22,color:GREY,italics:true})]});
const Warn = (l,t) => new Paragraph({spacing:{before:130,after:190},
  shading:{type:ShadingType.CLEAR,fill:'FDECEC'},border:{left:{style:BorderStyle.SINGLE,size:14,color:'9B2C2C',space:10}},
  children:[new TextRun({text:`${l}  `,bold:true,size:21,color:'8A1F1F'}),new TextRun({text:t,size:21,color:'5C1414'})]});
const Prompt2 = (ls) => new Paragraph({spacing:{before:90,after:180},
  shading:{type:ShadingType.CLEAR,fill:'EEF4FF'},border:{left:{style:BorderStyle.SINGLE,size:14,color:'2B5FCC',space:10}},
  children:ls.flatMap((l,i)=>[...(i?[new TextRun({break:1})]:[]),new TextRun({text:l,size:20,color:'16305E',italics:true})])});

const TOTAL = 9360;
function T(headers, rows, widths){
  const cell=(text,{bold=false,fill=null,w})=>new TableCell({
    width:{size:w,type:WidthType.DXA},
    shading: fill?{type:ShadingType.CLEAR,fill}:undefined,
    margins:{top:90,bottom:90,left:130,right:130},
    children:[new Paragraph({children:[new TextRun({text,bold,size:19,
      color: bold?'FFFFFF':'222833'})]})]});
  return new Table({ columnWidths:widths, width:{size:TOTAL,type:WidthType.DXA},
    rows:[ new TableRow({tableHeader:true, children:headers.map((h,i)=>cell(h,{bold:true,fill:NAVY,w:widths[i]}))}),
      ...rows.map((r,ri)=>new TableRow({children:r.map((c,i)=>cell(c,{fill: ri%2?LIGHT:null, w:widths[i]}))})) ]});
}

const body = [];
const push = (...x) => body.push(...x);

// ---------------- Cover ----------------
push(
  new Paragraph({ text:'Open Sentry Beacon', style:'Title', spacing:{before:2000,after:60} }),
  new Paragraph({ spacing:{after:240}, children:[new TextRun({text:'Installation & Contribution Handbook', size:30, bold:true, color:GOLD})] }),
  new Paragraph({ spacing:{after:520}, children:[new TextRun({text:'For the IT person standing up their own instance.', size:23, color:GREY, italics:true})] }),
  Rule(),
  P('This is a working document. Edit it freely — cut what does not apply to your church, add your own hostnames, and hand it to whoever runs your servers.'),
  P('Open source. No vendor is required to run it.', {color:GREY}),
  Break(),
);

// ---------------- TOC ----------------
push(
  new Paragraph({ text:'Contents', heading:HeadingLevel.HEADING_1 }),
  new TableOfContents('Contents', { hyperlink:true, headingStyleRange:'1-2' }),
  new Paragraph({ spacing:{after:200}, children:[new TextRun({ text:'(Right-click → Update Field to refresh after editing.)', size:18, color:GREY, italics:true })] }),
  Break(),
);

// ---------------- The one-hour path ----------------
push(
  new Paragraph({text:'The one-hour path',heading:HeadingLevel.HEADING_1}),
  Lead('Vercel + Supabase + Brevo + Claude, all free tiers. Follow it top to bottom and you will have a working church app with people in it.'),
  T(['#','Step','Time','You are done when'],[
    ['1','Fork Open-Sentry-Beacon on GitHub','2 min','It is under your own account'],
    ['2','supabase.com \u2192 New project. Pick a region near you. Save the database password.','5 min','Project says ACTIVE'],
    ['3','SQL editor \u2192 run every file in supabase/migrations/ in filename order','10 min','No red errors; tables exist'],
    ['4','vercel.com \u2192 Add New Project \u2192 import your fork \u2192 Deploy','5 min','A live URL that loads'],
    ['5','Supabase \u2192 Settings \u2192 API. Copy the URL and the anon key.','1 min','Both on your clipboard'],
    ['6','Vercel \u2192 Settings \u2192 Environment Variables \u2192 add both \u2192 Redeploy','4 min','The site asks you to sign in'],
    ['7','Sign up on your own site with your real email','2 min','You are in, but everything is empty'],
    ['8','SQL editor \u2192 run supabase/seed/01 (edit two lines first)','3 min','You are Executive Director'],
    ['9','SQL editor \u2192 run supabase/seed/02 (no edits)','2 min','Your church has people in it'],
    ['10','brevo.com \u2192 verify one sender \u2192 SMTP & API \u2192 copy SMTP details','10 min','Brevo confirms the address'],
    ['11','Supabase \u2192 Authentication \u2192 SMTP \u2192 paste them in','3 min','Saved'],
    ['12','Same screen \u2192 URL Configuration \u2192 add https://your-site/join','2 min','Saved'],
    ['13','Invite somebody real from the app and watch it arrive','5 min','An email lands in their inbox'],
  ],[760,3840,900,3860]),
  Note('If you only have thirty minutes','stop after step 9. Steps 10\u201313 are email, and the app is fully usable without it \u2014 invitation links appear on screen to send by hand.'),
  new Paragraph({text:'Where Claude fits',heading:HeadingLevel.HEADING_2}),
  P('The free tier of Claude is enough for all of it, because none of these steps need code written. Use it as the person who has read the repository, and paste its answers rather than guessing.'),
  Prompt2(['Good first message, with the repository open in front of you:','','"I am setting up Open Sentry Beacon from my fork on GitHub.','Read its README and docs/SETUP.md. I am on step 3 of the one-hour path','and the SQL editor gave me this error: <paste it>. What do I do?"']),
  P('It is worth telling it two things about this project up front, because both are unusual and it will otherwise guess: the security lives in the database rather than in the screens, and the app is designed to run with no backend at all so an empty-looking install is often correct rather than broken.'),
  Warn('One rule for the room.','If an assistant tells you something is secure, working or deployed, ask it how it knows. The honest answer names what it actually checked. The separate AI guide is entirely about this.'),
);

// ---------------- 1 ----------------
push(
  new Paragraph({ text:'1. What you are deploying', heading:HeadingLevel.HEADING_1 }),
  P('Hope Beacon pairs one member of a church with one person exploring faith, and helps them walk together through six stages. Everything else in the app — the library, lessons, prayer, meetings — exists to support that one relationship.'),
  P('Four roles, and the words appear on every screen:'),
  T(['Role','Who they are'],[
    ['Explorer','Someone exploring faith, at their own pace'],
    ['Guide','The church member walking with them'],
    ['Director','Leads a church’s Beacon ministry, usually the pastor'],
    ['Executive Director','The same role across more than one church'],
  ],[2400,6960]),
  new Paragraph({ text:'It runs in three shapes', heading:HeadingLevel.HEADING_2 }),
  T(['Shape','What it needs','Good for'],[
    ['Sample data','Nothing at all','Evaluating, training, demos. Works offline.'],
    ['One church','A database','A single congregation using it for real.'],
    ['Many churches','A database','A conference or union overseeing several.'],
  ],[2200,2700,4460]),
  Note('Start here.','Clone it and run it with no backend at all. Every feature works against built-in sample data. Decide whether you want the app before you provision anything.'),
);

// ---------------- 2 ----------------
push(Break(),
  new Paragraph({ text:'2. Choosing your stack', heading:HeadingLevel.HEADING_1 }),
  P('This project is deliberately not tied to any vendor. The reference deployment uses a particular set of services because something had to be chosen first, not because the app depends on them.'),
  P('What the app genuinely requires is short:'),
  T(['It needs','Reference deployment uses','Anything else that works'],[
    ['Somewhere to run a Node.js web app','Vercel','Netlify, Render, Fly.io, Railway, Cloudflare, a VPS with Docker, your own server'],
    ['A PostgreSQL database with row-level security','Supabase','Neon, Railway, RDS, self-hosted PostgreSQL 14+'],
    ['A way to sign people in','Supabase Auth','Any auth service, or your own'],
    ['A way to send two kinds of email (optional)','Brevo','Any SMTP server or mail API — or none at all'],
  ],[2500,2300,4560]),
  Note('On lock-in.','The database schema is plain SQL. The app talks to it through one folder. Swapping any layer is a day of work, not a rewrite — and if you already run PostgreSQL and a mail server, you need neither of the hosted services named above.'),
  P('The rest of this handbook uses the reference stack for its worked examples, because concrete instructions are more useful than abstract ones. Where a step is vendor-specific, it says so.'),
);

// ---------------- 3 ----------------
push(Break(),
  new Paragraph({ text:'3. Run it with no backend', heading:HeadingLevel.HEADING_1 }),
  P('Fifteen minutes, no accounts, no keys. Do this first — it proves the app works on your machine before any infrastructure is involved.'),
  Code(['git clone https://github.com/<your-account>/Open-Sentry-Beacon','cd Open-Sentry-Beacon','npm install','npm run dev','','# open http://localhost:3000']),
  P('You should get a working app with a sample church in it: Directors, Guides, Explorers, conversations, a library, lessons and a prayer wall. Sign in as any of the sample people.'),
  P('Requirements: Node.js 20 or newer, and git. Nothing else.'),
  Note('This is also your fallback.','A deployment with no database configured runs in exactly this mode. If anything goes wrong on the day of a presentation, removing two environment variables gets you back to something that cannot fail.'),
);

// ---------------- 4 ----------------
push(Break(),
  new Paragraph({ text:'4. Create the database', heading:HeadingLevel.HEADING_1 }),
  P('Any PostgreSQL 14+ database will do. The migrations are ordinary SQL files in supabase/migrations/, applied in filename order.'),
  new Paragraph({ text:'Using the reference stack', heading:HeadingLevel.HEADING_2 }),
  Num('Create a project at supabase.com. Choose a region near your congregation.'),
  Num('Open the SQL editor.'),
  Num('Run each file in supabase/migrations/ in order, oldest filename first.'),
  Num('Confirm the tables exist and that row-level security is ON for every one of them.'),
  new Paragraph({ text:'Using your own PostgreSQL', heading:HeadingLevel.HEADING_2 }),
  Code(['for f in supabase/migrations/*.sql; do','  psql "$DATABASE_URL" -f "$f"','done']),
  P('You will also need an authentication layer. The schema expects a table of users that profiles reference by UUID; see docs/BACKENDS.md for what to substitute if you are not using the reference auth service.'),
  Note('Do not skip the security check.','After the migrations, run the attack suite documented at the top of the first migration file. It asserts that a stranger reads nothing and that people who should see data still can. It takes seconds and it is the only test that checks the promise the app makes to its members.'),
);

// ---------------- 5 ----------------
push(Break(),
  new Paragraph({ text:'5. Deploy the app', heading:HeadingLevel.HEADING_1 }),
  P('Any host that can run a Next.js application works. The build command is standard.'),
  Code(['npm run build','npm run start   # serves on PORT, default 3000']),
  new Paragraph({ text:'Environment variables', heading:HeadingLevel.HEADING_2 }),
  P('Set these on your host. Both are safe to expose to browsers — they are designed to be public.'),
  T(['Variable','Value','Required'],[
    ['NEXT_PUBLIC_SUPABASE_URL','Your database project URL','To use a real backend'],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY','The public/anon key','To use a real backend'],
    ['SITE_URL','Your public address, e.g. https://beacon.yourchurch.org','Recommended'],
  ],[4300,3300,1760]),
  Note('Leave both unset','and the deployment runs on sample data. That is the switch — there is no flag to remember.'),
  new Paragraph({ text:'The one key that must never be public', heading:HeadingLevel.HEADING_2 }),
  P('Your database’s service_role (or equivalent superuser) key bypasses every security rule you just installed. It belongs only in server-side function secrets. Never in a variable whose name starts with NEXT_PUBLIC_, never in the repository, never in a browser.'),
  P('The anon key being public is not a mistake. What protects your members’ data is row-level security in the database, which is why the migrations matter more than the key does.'),
);

// ---------------- 6 ----------------
push(Break(),
  new Paragraph({text:'6. Email',heading:HeadingLevel.HEADING_1}),
  P('Yes — the email system comes with the fork. It is code in the repository, not something configured out of band: supabase/functions/invite/ is the function that issues invitations, and it is in every copy you clone.'),
  P('What does NOT come with the fork is an account to send through. That is the part each church supplies, and it is a dashboard change rather than a code change.'),
  Note('Email is optional.','Without it, invitations are still created and the link is shown on screen for a Director to pass on by hand — WhatsApp, a printed slip, out loud. A church with no budget and no domain can run this.'),
  new Paragraph({text:'How the invitation actually travels',heading:HeadingLevel.HEADING_2}),
  P('The app asks your authentication service to issue the invitation, and that service posts it using whatever SMTP you have given it. So you are not writing an email integration; you are giving your auth service a mail account.'),
  Code(['app  →  invite function  →  Supabase Auth  →  your SMTP  →  inbox']),
  new Paragraph({text:'Three things decide whether mail arrives',heading:HeadingLevel.HEADING_2}),
  Bullet('How the provider proves you own the sending address. Verifying a single ADDRESS takes minutes. Verifying a DOMAIN needs DNS records and time. If you need to send this week, choose one that offers the first.'),
  Bullet('Whether the free tier delivers to strangers. Some deliver only to the account owner until a domain is verified — the API returns success and nothing arrives, which is the worst possible failure because it looks like success.'),
  Bullet('Whether an IP allow-list is switched on. Serverless functions have no fixed outbound address, so the restriction must be OFF rather than added to. Adding one address appears to work once and then fails from another region.'),
  new Paragraph({text:'Setting it up',heading:HeadingLevel.HEADING_2}),
  Num('Create a free account with any transactional mail provider. Brevo verifies a single address and is the fastest to a working send; Postmark has better deliverability but manual approval; your own Postfix or a diocesan relay is perfectly fine.'),
  Num('Verify ONE sending address. Click the link they email you. Nothing works until this is done.'),
  Num('Copy the SMTP details they give you — host, port, username, password.'),
  Num('In Supabase: Project Settings → Authentication → SMTP Settings. Paste them in.'),
  Code(['Host:      smtp.your-provider.example','Port:      587','Username:  from your provider (often not your email)','Password:  the SMTP key, not your login password','Sender:    the address you verified in step 2']),
  Num('In the same area, add your redirect URLs, or the link in the mail lands on a home page instead of a sign-up form:'),
  Code(['http://localhost:3000/join','https://your-deployment.example/join']),
  Note('Test by sending to somebody else.','Not to yourself. A dashboard tick is not evidence, and the free-tier restriction above hides precisely in the difference between your own address and anybody else\'s.'),
  P('docs/EMAIL.md in the repository is the longer version, with a troubleshooting table.'),
);

// ---------------- 7 ----------------
push(Break(),
  new Paragraph({text:'7. Make yourself the first Director, and put people in',heading:HeadingLevel.HEADING_1}),
  P('There is no public sign-up \u2014 every account arrives by invitation \u2014 so the first seat is granted from a database session. Two scripts in the repository do it; you do not have to write SQL.'),
  Num('Sign up once through the app with your own email.'),
  Num('Open supabase/seed/01_make_me_the_first_director.sql. Change the two lines at the top to your address and your church name, then paste the whole file into the Supabase SQL editor and run it.'),
  Num('Sign out and back in. You are now Executive Director.'),
  new Paragraph({text:'Give yourself something to look at',heading:HeadingLevel.HEADING_2}),
  P('A correctly installed Hope Beacon is indistinguishable from a broken one until somebody is in it: every screen works and every screen is empty. That is a terrible first five minutes and it makes a demonstration impossible.'),
  Num('Run supabase/seed/02_demo_congregation.sql. No edits needed.'),
  P('You now have two Guides, three Explorers, a conversation, a published blog post and a draft, prayer requests, a library, meetings, lesson series, and one member deliberately left unapproved so there is something for a Director to approve in front of an audience.'),
  Code(['Sign in as any of these \u2014 password HopeBeacon2026!','','  maria@example.test    Guide','  david@example.test    Guide','  john@example.test     Explorer (paired with Maria)','  grace@example.test    Explorer','  pastor@example.test   Director']),
  Note('Delete this before real members join.','The removal script is at the bottom of the same seed file. It is three deletes rather than one, because three foreign keys block instead of cascading.'),
);

// ---------------- 8 ----------------
push(Break(),
  new Paragraph({ text:'8. Before real people go in', heading:HeadingLevel.HEADING_1 }),
  P('A short checklist. Each item has cost somebody a bad week somewhere.'),
  T(['Check','Why'],[
    ['Row-level security ON for every table','The public key reaches every browser. Policies are the only thing between it and your members.'],
    ['service_role key is not in any NEXT_PUBLIC_ variable','It bypasses every policy you just wrote.'],
    ['The attack suite passes','It proves a stranger reads nothing AND that legitimate readers still can.'],
    ['Password minimum raised to 10','The app asks for 10; a backend set to 6 rejects people with a message that explains nothing.'],
    ['Redirect URLs allow-listed','Otherwise invitation links land nowhere useful.'],
    ['A real test email delivered and opened','See section 6.'],
    ['Backups switched on','Ask what the retention actually is on your plan.'],
  ],[3400,5960]),
  Note('One rule worth internalising.','The screens decide what to SHOW. The database decides what someone is ALLOWED TO HAVE. Anyone can send a request without using your screens, so any rule written only in JavaScript is not a rule.'),
);

// ---------------- 9 ----------------
push(Break(),
  new Paragraph({ text:'9. When something is wrong', heading:HeadingLevel.HEADING_1 }),
  T(['Symptom','Almost always'],[
    ['App loads but shows sample data','The two environment variables are missing or misspelled. Redeploy after adding them.'],
    ['Everything returns zero rows','Row-level security is on and no policy matches. Check the migrations all ran.'],
    ['"infinite recursion detected in policy"','A policy queries a table whose own policy queries it back. Route it through a SECURITY DEFINER helper.'],
    ['Nothing arrives by email','Sender not verified, or the free tier only delivers to the account owner.'],
    ['Provider returns 401','Wrong key, or an IP allow-list rejecting a valid one. The response body says which.'],
    ['Invitation link opens the home page','Redirect URL not allow-listed.'],
    ['A screen says "nothing here"','Check whether the read failed rather than returned empty. They look identical unless the app is careful.'],
  ],[3400,5960]),
);

// ---------------- 10 ----------------
push(Break(),
  new Paragraph({ text:'10. How to contribute', heading:HeadingLevel.HEADING_1 }),
  P('This is intended to be built the way long-lived open projects are built: in the open, by many hands, over years. Contributions from churches running it are worth more than contributions from anyone else, because you know what actually breaks on a Sabbath morning.'),
  new Paragraph({ text:'Ways to help that are not code', heading:HeadingLevel.HEADING_2 }),
  Bullet('Report what confused a real person. Usability reports from a live congregation are the scarcest thing this project gets.'),
  Bullet('Translate. The interface is designed for it.'),
  Bullet('Improve these instructions. If a step was wrong for your platform, that is a documentation bug worth filing.'),
  Bullet('Write about your deployment — what you chose and why.'),
  new Paragraph({ text:'Contributing code', heading:HeadingLevel.HEADING_2 }),
  Num('Open an issue first for anything substantial, so effort is not wasted.'),
  Num('Fork, branch, and keep the change to one thing.'),
  Num('Run the checks before opening a pull request:'),
  Code(['npm run verify:all       # everything','npx tsc --noEmit','npm run build']),
  Num('Explain WHY in the commit message, not just what. The diff already says what.'),
  new Paragraph({ text:'Rules that are not style preferences', heading:HeadingLevel.HEADING_2 }),
  Bullet('Row-level security stays on for every new table, in the same migration that creates it.'),
  Bullet('No privileged key ever reaches a browser.'),
  Bullet('Nothing trusts client-supplied metadata for a privilege — role, church and approval come from the invitation.'),
  Bullet('A conversation is readable by exactly two people. No leadership exception.'),
  Bullet('An Explorer is never shown their own journey stage.'),
  Bullet('Security tests need a positive control. Proving a stranger reads zero rows means nothing unless you also prove someone entitled reads one.'),
  P('CONTRIBUTING.md and CODE_OF_CONDUCT.md in the repository are the authoritative versions.'),
);

// ---------------- 11 ----------------
push(Break(),
  new Paragraph({ text:'11. Where to look next', heading:HeadingLevel.HEADING_1 }),
  T(['Document','What it covers'],[
    ['README.md','What the app is, and the fastest way to see it.'],
    ['docs/SETUP.md','The short install path.'],
    ['docs/BACKENDS.md','Connecting a backend other than the reference one.'],
    ['docs/EMAIL.md','Mail, with any provider or none.'],
    ['docs/SECURITY.md','What you become responsible for with real names in it.'],
    ['docs/BUILD-YOUR-OWN.md','The long course: building the backend yourself.'],
    ['docs/PLATFORMS.md','Which devices and browsers are supported.'],
    ['ARCHITECTURE.md','How the pieces fit together.'],
    ['CONTRIBUTING.md','Working on the project itself.'],
  ],[3200,6160]),
  Rule(),
  P('Questions, corrections and better ideas are all welcome as issues on the repository.', {color:GREY, italics:true}),
);

const doc = new Document({
  creator:'Open Sentry Beacon',
  title:'Open Sentry Beacon — Installation & Contribution Handbook',
  description:'For IT staff deploying their own instance.',
  numbering:{ config:[
    { reference:'dots', levels:[{ level:0, format:LevelFormat.BULLET, text:'•', alignment:AlignmentType.LEFT,
      style:{ paragraph:{ indent:{ left:460, hanging:240 } } } }] },
    { reference:'steps', levels:[{ level:0, format:LevelFormat.DECIMAL, text:'%1.', alignment:AlignmentType.LEFT,
      style:{ paragraph:{ indent:{ left:460, hanging:240 } } } }] },
  ]},
  styles:{
    default:{ document:{ run:{ font:'Calibri', size:21 } } },
    paragraphStyles:[
      { id:'Title', name:'Title', basedOn:'Normal', next:'Normal',
        run:{ size:54, bold:true, color:NAVY }, paragraph:{ spacing:{after:120} } },
      { id:'Heading1', name:'Heading 1', basedOn:'Normal', next:'Normal', quickFormat:true,
        run:{ size:32, bold:true, color:NAVY }, paragraph:{ spacing:{before:360,after:170}, outlineLevel:0 } },
      { id:'Heading2', name:'Heading 2', basedOn:'Normal', next:'Normal', quickFormat:true,
        run:{ size:25, bold:true, color:NAVY }, paragraph:{ spacing:{before:300,after:120}, outlineLevel:1 } },
    ],
  },
  sections:[{ properties:{ page:{ size:{ width:12240, height:15840 },
    margin:{ top:1100, bottom:1100, left:1440, right:1440 } } }, children: body }],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync('Open-Sentry-Beacon-Handbook.docx', b); console.log('written', b.length, 'bytes'); });
