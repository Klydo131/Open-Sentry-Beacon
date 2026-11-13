const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  LevelFormat, PageBreak, TableOfContents,
} = require('docx');
const fs = require('fs');
const NAVY='1B2A4A', GOLD='C9A227', GREY='5A6472', LIGHT='F2F4F7', RED='9B2C2C', MONO='Consolas';

const P=(t,o={})=>new Paragraph({spacing:{after:130},children:[new TextRun({text:t,size:21,color:'222833',...o})]});
const Bullet=t=>new Paragraph({numbering:{reference:'dots',level:0},spacing:{after:90},children:[new TextRun({text:t,size:21})]});
const Num=t=>new Paragraph({numbering:{reference:'steps',level:0},spacing:{after:90},children:[new TextRun({text:t,size:21})]});
const Code=ls=>new Paragraph({spacing:{before:90,after:170},shading:{type:ShadingType.CLEAR,fill:LIGHT},
  border:{left:{style:BorderStyle.SINGLE,size:12,color:GOLD,space:8}},
  children:ls.flatMap((l,i)=>[...(i?[new TextRun({break:1})]:[]),new TextRun({text:l,font:MONO,size:18,color:'20262F'})])});
const Prompt=ls=>new Paragraph({spacing:{before:90,after:180},shading:{type:ShadingType.CLEAR,fill:'EEF4FF'},
  border:{left:{style:BorderStyle.SINGLE,size:14,color:'2B5FCC',space:10}},
  children:ls.flatMap((l,i)=>[...(i?[new TextRun({break:1})]:[]),new TextRun({text:l,size:20,color:'16305E',italics:true})])});
const Note=(l,t,fill='FFF8E1',bar=GOLD,lc='7A5C00',tc='4A3B00')=>new Paragraph({spacing:{before:130,after:190},
  shading:{type:ShadingType.CLEAR,fill},border:{left:{style:BorderStyle.SINGLE,size:14,color:bar,space:10}},
  children:[new TextRun({text:`${l}  `,bold:true,size:21,color:lc}),new TextRun({text:t,size:21,color:tc})]});
const Warn=(l,t)=>Note(l,t,'FDECEC',RED,'8A1F1F','5C1414');
const Rule=()=>new Paragraph({spacing:{before:60,after:200},border:{bottom:{style:BorderStyle.SINGLE,size:6,color:'D8DCE3',space:2}},children:[new TextRun({text:''})]});
const Break=()=>new Paragraph({children:[new PageBreak()]});
const TOTAL=9360;
function T(h,rows,w){
  const cell=(text,{bold=false,fill=null,wd})=>new TableCell({width:{size:wd,type:WidthType.DXA},
    shading:fill?{type:ShadingType.CLEAR,fill}:undefined,margins:{top:90,bottom:90,left:130,right:130},
    children:[new Paragraph({children:[new TextRun({text,bold,size:19,color:bold?'FFFFFF':'222833'})]})]});
  return new Table({columnWidths:w,width:{size:TOTAL,type:WidthType.DXA},
    rows:[new TableRow({tableHeader:true,children:h.map((x,i)=>cell(x,{bold:true,fill:NAVY,wd:w[i]}))}),
      ...rows.map((r,ri)=>new TableRow({children:r.map((c,i)=>cell(c,{fill:ri%2?LIGHT:null,wd:w[i]}))}))]});
}
const b=[]; const push=(...x)=>b.push(...x);

push(
  new Paragraph({text:'Open Sentry Beacon',style:'Title',spacing:{before:2000,after:60}}),
  new Paragraph({spacing:{after:240},children:[new TextRun({text:'Building It With an AI Assistant',size:30,bold:true,color:GOLD})]}),
  new Paragraph({spacing:{after:520},children:[new TextRun({text:'A guide for developers using Claude, Codex, Cursor, Copilot or similar to stand up their own instance.',size:23,color:GREY,italics:true})]}),
  Rule(),
  P('An AI assistant can put this app in front of your congregation in a day. It can also confidently tell you the security is working when it is not.'),
  P('This document is about getting the first outcome and avoiding the second.'),
  Break(),
  new Paragraph({text:'Contents',heading:HeadingLevel.HEADING_1}),
  new TableOfContents('Contents',{hyperlink:true,headingStyleRange:'1-2'}),
  new Paragraph({spacing:{after:200},children:[new TextRun({text:'(Right-click → Update Field to refresh after editing.)',size:18,color:GREY,italics:true})]}),
  Break(),
);

push(
  new Paragraph({text:'1. Before you prompt anything',heading:HeadingLevel.HEADING_1}),
  P('The single biggest determinant of how this goes is what the assistant reads first. Point it at these, in this order, before asking for any code:'),
  T(['File','Why it matters first'],[
    ['README.md','What the app is and what the words mean.'],
    ['docs/SECURITY.md','The rules that must survive every change.'],
    ['docs/SETUP.md','The install path you are following.'],
    ['docs/BACKENDS.md','What is pluggable and what is not.'],
    ['supabase/migrations/0001_core_schema.sql','The schema, and the attack suite documented at the top of it.'],
  ],[3700,5660]),
  P('A useful opening instruction:'),
  Prompt(['Read README.md, docs/SECURITY.md and the header comment of','supabase/migrations/0001_core_schema.sql before writing anything.','Then tell me, in your own words, who is allowed to read a','conversation and why an Explorer is never shown their journey','stage. Do not write code yet.']),
  Note('Why ask it to explain first.','If it cannot state those two rules back to you correctly, it will break them later, and you will find out from a member rather than from a test. Thirty seconds here saves an afternoon.'),
);

push(Break(),
  new Paragraph({text:'2. The order to build in',heading:HeadingLevel.HEADING_1}),
  P('Work in stages and confirm each one in a browser before starting the next. An assistant will happily build all six at once and hand you something where you cannot tell which part is broken.'),
  T(['Stage','Ask for','Done when'],[
    ['1','It runs on sample data','You can sign in as a sample Director and see a dashboard.'],
    ['2','Database created, migrations applied','The attack suite passes, positive controls included.'],
    ['3','Sign-in against the real backend','You sign in as yourself and land on the right dashboard.'],
    ['4','Director screens: approvals, pairing','You approve someone and pair two people; it survives a refresh.'],
    ['5','Guide and Explorer: one conversation','Two browsers, two accounts, messages appearing live.'],
    ['6','Invitations by email','A real invitation arrives and the link creates an approved account.'],
  ],[900,3600,4860]),
  Note('Stage 1 is not a formality.','It proves your toolchain works before any infrastructure exists. If the assistant wants to skip it, do not let it.'),
);

push(Break(),
  new Paragraph({text:'3. Rules to give the assistant',heading:HeadingLevel.HEADING_1}),
  P('Paste these into its instructions file — CLAUDE.md, .cursorrules, AGENTS.md, whatever your tool reads. Every one of them has been broken by a competent developer on this codebase.'),
  Bullet('Row-level security stays ON for every table, in the same migration that creates it.'),
  Bullet('The service_role key never leaves the server. Not in the repo, not in any NEXT_PUBLIC_ variable, not in a browser file.'),
  Bullet('Nothing trusts client-supplied metadata for a privilege. Sign-up lets the caller send arbitrary data; role, church and approval come from the invitation record, never from the request.'),
  Bullet('Cross-table policy references go through a SECURITY DEFINER helper. A policy on A that queries B whose policy queries A makes Postgres refuse the read entirely.'),
  Bullet('A conversation is readable by exactly two people. No leadership branch, no audit exception.'),
  Bullet('An Explorer is never shown a journey stage, including their own.'),
  Bullet('JavaScript never enforces access. Anyone can call the database directly with the same public key, so a filter in application code is for correctness, never for security.'),
  Warn('The one that catches everybody.','If you find yourself writing "and only if the user is an admin" in TypeScript, that rule belongs in a database policy. An assistant will write the TypeScript version because it looks right and passes the test it also wrote.'),
);

push(Break(),
  new Paragraph({text:'4. How to check what it produced',heading:HeadingLevel.HEADING_1}),
  P('This is the section that matters. AI assistants report success sincerely and often. The failures below are all real, and all of them initially looked like passing tests.'),
  new Paragraph({text:'A zero proves nothing',heading:HeadingLevel.HEADING_2}),
  P('An assistant tests "can an outsider read this table?", gets 0 rows, and reports airtight isolation. But 0 rows is also what you get from an empty table, a null user, or a query against the wrong database.'),
  P('Every security test needs a positive control in the same run: prove the row exists, and prove somebody entitled to it reads exactly 1. Three separate "isolation confirmed" results on this project were later found to be empty tables.'),
  Prompt(['For every access test, also show that a user who SHOULD see the','row does see it, in the same transaction. A zero with no positive','control is not evidence and I will not accept it.']),
  new Paragraph({text:'A test that starts in the state it is testing for',heading:HeadingLevel.HEADING_2}),
  P('A check for "can a member approve themselves?" reported ALLOWED — a critical vulnerability. The fixture had already set approved to true, so the update changed nothing and the trigger correctly did nothing. Re-run from genuinely unapproved, it was refused.'),
  new Paragraph({text:'Silent catch blocks',heading:HeadingLevel.HEADING_2}),
  P('A refused database read and an empty list look identical if the code swallows the error. Screens then say "nothing here" when the truth is "you were not allowed". Ask for errors to be surfaced, not defaulted away.'),
  Code(['// Bad: a refusal renders as an empty page.','.catch(() => setRows([]))']),
  new Paragraph({text:'Claims about deployment',heading:HeadingLevel.HEADING_2}),
  P('Pushing code is not deploying it, and deploying is not verifying. An assistant that cannot reach your host cannot know the build went green. Ask it to say which of the three actually happened.'),
);

push(Break(),
  new Paragraph({text:'5. Commands to insist on',heading:HeadingLevel.HEADING_1}),
  P('Before you accept any change, these run clean. Have the assistant run them and paste the real output, not a summary of it.'),
  Code(['npm run verify:all       # everything','npx tsc --noEmit         # types','npm run build            # must pass before any push','node tests/no-secrets.js # nothing private committed']),
  P('And after any change to database policies, re-run the attack suite documented at the top of the first migration. It is the cheapest test in the project and the only one that checks the promise the app makes to its members.'),
  Note('Ask for the output.','"All tests pass" is a claim. A pasted terminal transcript is evidence. The difference costs you nothing to insist on.'),
);

push(Break(),
  new Paragraph({text:'6. What AI is genuinely good at here',heading:HeadingLevel.HEADING_1}),
  T(['Task','Suitability'],[
    ['Applying migrations and wiring screens to a backend','Excellent. Mechanical, well-specified, easy to verify.'],
    ['Translating the interface','Excellent, with a native speaker reviewing.'],
    ['Writing browser tests for flows you describe','Very good. Ask for tests that fail first.'],
    ['Explaining an unfamiliar part of the codebase','Very good, and cheaper than reading it cold.'],
    ['Designing database security policies','Use with care. Have it explain the threat model before the SQL.'],
    ['Judging whether security is correct','Poor. It will believe its own passing test. Verify yourself.'],
    ['Deciding what a church actually needs','Not its job. That is yours.'],
  ],[3900,5460]),
);

push(Break(),
  new Paragraph({text:'7. A worked opening sequence',heading:HeadingLevel.HEADING_1}),
  P('If you want something to paste, start here and adapt.'),
  Num('Orient it:'),
  Prompt(['Read README.md, docs/SECURITY.md, docs/SETUP.md and the header of','supabase/migrations/0001_core_schema.sql. Summarise the four roles','and the two privacy promises. Do not write code.']),
  Num('Get it running locally:'),
  Prompt(['Get this running on my machine with no backend, using the built-in','sample data. Tell me the exact commands and what I should see.']),
  Num('Stand up the database:'),
  Prompt(['I have created an empty PostgreSQL database. Apply the migrations in','order, then run the attack suite from the first migration and paste','the full output — including the positive controls that prove','legitimate readers still see their own rows.']),
  Num('Then, one stage at a time, work through the table in section 2 — and open a browser after each.'),
  Rule(),
  P('If the assistant ever tells you something is secure, working or deployed, ask it how it knows. The good ones will tell you honestly what they checked and what they assumed.',{italics:true,color:GREY}),
);

const doc=new Document({
  creator:'Open Sentry Beacon',
  title:'Open Sentry Beacon — Building It With an AI Assistant',
  description:'For developers using an AI coding assistant to deploy their own instance.',
  numbering:{config:[
    {reference:'dots',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:460,hanging:240}}}}]},
    {reference:'steps',levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:460,hanging:240}}}}]},
  ]},
  styles:{default:{document:{run:{font:'Calibri',size:21}}},paragraphStyles:[
    {id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{size:54,bold:true,color:NAVY},paragraph:{spacing:{after:120}}},
    {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:32,bold:true,color:NAVY},paragraph:{spacing:{before:360,after:170},outlineLevel:0}},
    {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:25,bold:true,color:NAVY},paragraph:{spacing:{before:300,after:120},outlineLevel:1}},
  ]},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1100,bottom:1100,left:1440,right:1440}}},children:b}],
});
Packer.toBuffer(doc).then(x=>{fs.writeFileSync('Open-Sentry-Beacon-AI-Build-Guide.docx',x);console.log('written',x.length,'bytes');});
