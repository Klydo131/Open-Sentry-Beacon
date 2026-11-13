-- The example studies are Christ-centred, plainly written, and sourced.
--
-- WHAT WAS ASKED FOR, in two messages:
--
--   
--
--   
--
-- WHAT WAS WRONG. The four example series read reasonably and cited NOTHING.
-- Every lesson was about 360 characters of pleasant prose with a Bible
-- reference and no indication of where any of it came from -- which is exactly
-- what AI-written filler looks like, and a Guide handing it to somebody had no
-- way to answer "says who?".
--
-- WHAT CHANGED, AND THE THREE RULES BEHIND IT.
--
-- ONE: EVERY LESSON NAMES ITS SOURCE. Not a vague appeal to tradition -- a book,
-- a chapter, and where to read it free. The sources are the Seventh-day
-- Adventist Church's own and nobody else's:
--
--   * Ellen G. White, `Steps to Christ` (1892) and `The Desire of Ages` (1898),
--     free from the Ellen G. White Estate at m.egwwritings.org
--   * The 28 Fundamental Beliefs, at adventist.org/beliefs
--   * The Discover Bible Guides from Voice of Prophecy, which exist for exactly
--     this reader and are free
--
-- Those addresses were checked before being written down, not recalled.
--
-- TWO: CHRIST FIRST, DOCTRINE SECOND, FOR AN EXPLORER. `Steps to Christ` is the
-- most Christ-centred thing in the Adventist library and barely doctrinal at
-- all, which is why it is the spine of the first series. An Explorer meets
-- Jesus with people -- a man nobody would touch, a woman everybody was ready to
-- stone, a tax collector up a tree -- long before they meet a teaching about
-- him. The Adventist values are there in every one of them: that God is love,
-- that the body matters, that rest is a gift, that the future is not something
-- to be frightened of. Embedded, as asked, rather than announced.
--
-- THREE: NO INSIDE WORDS FOR SOMEBODY WHO MAY BE WARY OF RELIGION. The first
-- series uses none of: salvation, sin, grace, repentance, righteousness,
-- atonement, sanctification, testimony, backsliding, saved, born again, the
-- Lord, doctrine. Not because those words are wrong, but because a person who
-- did not grow up with them hears a closed door. `tests/the-studies-are-sourced.mjs`
-- fails if one gets back in.
--
-- The rows are UPDATED IN PLACE, ids unchanged. Anybody who has already taken
-- their own copy of one keeps it exactly as it was -- copies are separate rows
-- with `copied_from` pointing here, so nothing anybody wrote is touched.

begin;

-- ===========================================================================
-- 1. Who is Jesus, really?  -- the Explorer's series
-- ===========================================================================
--
-- Retitled from "Who is God, really?". The request was Christ first, and the
-- honest way to do that is to say whose story this is in the title.

update public.lesson_series set
  title = 'Who is Jesus, really?',
  description = 'Six short readings for someone starting from scratch. No church words, no assumptions.'
where id = '11110000-0000-4000-8000-00000000000a';

update public.lessons set
  title = 'Someone who already knows you',
  body = 'Most people start here: not sure. That is a fair place to begin, and honest doubt is better company than borrowed certainty.

Before anything about Jesus, one idea has to be tested — that being fully known might not be a threat.

**Read:** Psalm 139, verses 1 to 12.

Notice what it does not do. It does not argue anyone into anything. It describes being known — every word before it is said, every road taken, the dark included — and treats that as comfort rather than surveillance.

**To think about:** if someone knew you completely, the parts you keep hidden included, would that frighten you or come as a relief? Answer honestly. Both answers are common, and the second one usually takes a while.

**Where this comes from:** Ellen White opens *Steps to Christ* with the claim that everything in nature and in the Bible is there to tell us one thing about God, and it is not that he is watching to catch us out. Chapter 1, "God''s Love for Man" — free to read at m.egwwritings.org/en/book/108/toc'
where series_id = '11110000-0000-4000-8000-00000000000a' and position = 1;

update public.lessons set
  title = 'The face people did not expect',
  body = 'Everyone carries a picture of God long before deciding whether they believe in one. Usually it is a face that looks disappointed.

Jesus told a story to correct that picture, and he told it to people who were sure they already knew the answer.

**Read:** Luke 15, verses 11 to 24 — the son who spent everything and came home.

The son has a speech ready. He has rehearsed it the whole way. He never finishes it, because the father is already running, and in that culture a grown man did not run. The father makes himself look ridiculous to reach his son a few seconds sooner.

**To think about:** whose face do you see when you imagine God looking at you? Where did that face come from — something you were taught, or something that happened to you?

**Where this comes from:** *Steps to Christ*, chapter 1, argues that Jesus told stories like this precisely because people had inherited a picture of God that was not true and could not be argued away, only replaced. Free at m.egwwritings.org/en/book/108/toc'
where series_id = '11110000-0000-4000-8000-00000000000a' and position = 2;

update public.lessons set
  title = 'The man nobody would touch',
  body = 'Some of what Jesus did makes more sense once you know what it cost him to do it.

Leprosy in the first century meant more than illness. It meant living outside the town, calling out a warning when anyone approached, and going untouched for years — sometimes for life.

**Read:** Mark 1, verses 40 to 42.

Jesus could have healed him with a word. He had done that before and would again. Instead he reached out and touched him first. Under the law of the time, touching made Jesus unclean rather than making the man clean. He did it anyway, and it worked the other way round.

**To think about:** is there a part of your life you assume would have to be cleaned up before you would be welcome anywhere? What if the order runs the other way?

**Where this comes from:** *The Desire of Ages* (1898) is Ellen White''s book on the life of Jesus, and this instinct — that he touched people before he fixed them — runs through the whole of it. Free at m.egwwritings.org/en/book/130/toc'
where series_id = '11110000-0000-4000-8000-00000000000a' and position = 3;

update public.lessons set
  title = 'What he did with people caught out',
  body = 'It is easy to admire someone kind to people who deserve it. Harder to know what to make of someone kind to people who plainly do not.

**Read:** John 8, verses 1 to 11 — a woman dragged into a public square, guilty, with a crowd already holding stones.

Two things are worth slowing down for. He does not pretend she has done nothing wrong; he is the only person present who does not throw anything. And he says the thing that empties the square: whoever has never done anything wrong goes first. They leave oldest to youngest, which is its own quiet comment on how much any of us has to be proud of.

**To think about:** which is harder to accept — that he refused to condemn her, or that he refused to pretend it did not matter? Most people find one of those much harder than the other.

**Where this comes from:** *The Desire of Ages*, in its chapters on the last week of Jesus'' teaching, treats this scene as the clearest picture of how he handled failure: neither excusing it nor using it. Free at m.egwwritings.org/en/book/130/toc'
where series_id = '11110000-0000-4000-8000-00000000000a' and position = 4;

update public.lessons set
  title = 'An offer made to tired people',
  body = 'Most invitations to believe something are aimed at people who are searching. This one is aimed at people who are worn out.

**Read:** Matthew 11, verses 28 to 30.

Read it slowly, because the middle of it is easy to skip. He does not offer an escape from work. He offers a lighter load and better company while carrying it. The word he uses is the wooden yoke two animals share — one experienced, one not — so that the stronger one carries most of the weight.

**To think about:** what are you actually tired of? Name the specific thing rather than the general one. This offer is made to that, not to a mood.

**Where this comes from:** *Steps to Christ*, chapter 11, "The Privilege of Prayer", is about what it looks like to take somebody up on this in practice. Free at m.egwwritings.org/en/book/108/toc

If you would like to keep reading on your own, Voice of Prophecy runs the free Discover Bible Guides, written for exactly this stage: voiceofprophecy.com/study/discover'
where series_id = '11110000-0000-4000-8000-00000000000a' and position = 5;

update public.lessons set
  title = 'The last conversation he had',
  body = 'If you want to know what somebody really believes, watch what they do when there is nothing left to gain.

**Read:** Luke 23, verses 32 to 43.

Jesus is hours from death. Beside him is a man being executed for his own crimes, who says so out loud. He has no time left to become a better person, nothing to offer, and no way to make anything right. He asks one thing: remember me.

The answer comes back without conditions and without a delay.

**To think about:** that conversation is either the most reckless thing in the book or the whole point of it. Which do you think it is, and what would it mean if it were the second?

**Where this comes from:** The Seventh-day Adventist Church states this as its own position in the 28 Fundamental Beliefs — belief 10, "The Experience of Salvation" — that being accepted is a gift and not a wage. Read them all at adventist.org/beliefs

*The Desire of Ages* covers this scene in its chapters on the crucifixion: m.egwwritings.org/en/book/130/toc'
where series_id = '11110000-0000-4000-8000-00000000000a' and position = 6;

-- ===========================================================================
-- 2. Rest -- the Sabbath, without the argument
-- ===========================================================================
--
-- An Adventist distinctive, and the one most easily heard as a rule. Framed as
-- what it is FOR, which is also how Jesus framed it when he was challenged
-- about it.

update public.lesson_series set
  title = 'Rest, and the day built for it',
  description = 'Three readings on why a day is set aside, and what it is for.'
where id = '11110000-0000-4000-8000-00000000000b';

update public.lessons set
  title = 'It was there before any rule was',
  body = 'The seventh day appears in the Bible long before there is a commandment about it, a nation to keep it, or a building to keep it in.

**Read:** Genesis 2, verses 1 to 3.

Nothing is commanded here. Something is finished, and then set apart. The pattern is work, then stop — in that order, and the stopping is treated as part of the making rather than a break from it.

**To think about:** when did you last stop for a whole day, on purpose, without earning it first? What made it difficult?

**Where this comes from:** the Seventh-day Adventist position is set out in the 28 Fundamental Beliefs, number 20, "The Sabbath" — which begins at creation rather than at Sinai for exactly this reason: adventist.org/beliefs'
where series_id = '11110000-0000-4000-8000-00000000000b' and position = 1;

update public.lessons set
  title = 'Made for people, not the other way round',
  body = 'By the time of Jesus, the day had collected rules. A lot of them. Enough that people were arguing about whether feeding yourself counted as work.

**Read:** Mark 2, verses 23 to 28.

His answer is one sentence and it settles the question of what the day is for: the Sabbath was made for man, not man for the Sabbath. It is a gift given to people, not a test set for them. Everything else about the day follows from which way round that is.

**To think about:** what would a day genuinely built for your good look like? Not a day of restrictions — a day designed by someone who wanted you to be well.

**Where this comes from:** *The Desire of Ages* has a chapter on exactly this argument and what Jesus was doing in it — free at m.egwwritings.org/en/book/130/toc'
where series_id = '11110000-0000-4000-8000-00000000000b' and position = 2;

update public.lessons set
  title = 'A delight, in its own words',
  body = 'The Bible has one passage that says outright what the day is supposed to feel like, and the word it chooses is not duty.

**Read:** Isaiah 58, verses 13 and 14.

The word is delight. Read the verses just before it too — the chapter spends most of its length on feeding hungry people and housing people with nowhere to go, and only then arrives at rest. The two belong together in the writer''s mind.

**To think about:** if one day a week were genuinely yours, what would you want in it? What would you want out of it?

**Where this comes from:** the 28 Fundamental Beliefs, number 20, sets rest alongside worship and service rather than in place of them: adventist.org/beliefs'
where series_id = '11110000-0000-4000-8000-00000000000b' and position = 3;

-- ===========================================================================
-- 3. What comes next, read calmly
-- ===========================================================================
--
-- Retitled away from "Prophecy". For somebody who is not sure about religion,
-- that word arrives carrying a hundred years of television preachers.

update public.lesson_series set
  title = 'What comes next, read calmly',
  description = 'Three readings on how the story ends, without the fear.'
where id = '11110000-0000-4000-8000-00000000000c';

update public.lessons set
  title = 'A king who could not sleep',
  body = 'The parts of the Bible people find frightening are usually the parts they meet second-hand. Read first-hand, the tone is different.

**Read:** Daniel 2, verses 1 to 6, then 26 to 30, then 31 to 45.

A king has a dream he cannot shake. What he is shown is a statue made of falling-value metals — gold at the head down to clay at the feet — and every empire in it comes and goes. The thing the passage is most interested in is the last line: a kingdom that does not get replaced by the next one.

**To think about:** the point being made is that power is temporary and no empire is the final word. Does that read to you as a threat or as a relief?

**Where this comes from:** Voice of Prophecy''s free Discover Bible Guides work through Daniel at a beginner''s pace, with a real person to ask if you want one: voiceofprophecy.com/study/discover'
where series_id = '11110000-0000-4000-8000-00000000000c' and position = 1;

update public.lessons set
  title = 'He said it plainly, and told them not to panic',
  body = 'Jesus was asked directly about the end of things. His answer is worth reading before anyone else''s answer about his answer.

**Read:** Matthew 24, verses 3 to 14, and then John 14, verses 1 to 3.

Notice the instruction that keeps repeating in the first passage: do not be alarmed. He describes hard things and tells people not to be frightened by them in the same breath. And the second passage — short, and much older than any chart anybody has drawn — is a promise about coming back for people, not about dates.

**To think about:** which do you notice more in what you have heard about the end of the world: the timetable, or the promise? Which does Jesus spend his words on?

**Where this comes from:** the 28 Fundamental Beliefs, number 25, "The Second Coming of Christ", holds that the time is deliberately not given — and that anybody setting a date has left the text: adventist.org/beliefs'
where series_id = '11110000-0000-4000-8000-00000000000c' and position = 2;

update public.lessons set
  title = 'What is actually being promised',
  body = 'Most of what people picture about the end is borrowed from paintings and films. The Bible''s own last description is more ordinary than that, and much more specific.

**Read:** Revelation 21, verses 1 to 5.

It is not an escape to somewhere else. It is this world put right, with the writer stopping to list the things that will be missing: no more death, no grief, no crying, no pain. The last line is the one to sit with — everything made new, rather than everything replaced.

**To think about:** which item on that list would you most want to be true? That answer usually says something about where you have been.

**Where this comes from:** *The Desire of Ages* closes on this hope rather than on fear: m.egwwritings.org/en/book/130/toc — and the 28 Fundamental Beliefs, number 28, "The New Earth": adventist.org/beliefs'
where series_id = '11110000-0000-4000-8000-00000000000c' and position = 3;

-- ===========================================================================
-- 4. The body, and looking after it
-- ===========================================================================
--
-- The Adventist health emphasis, which is one of the church's most recognised
-- contributions and is easy to turn into a list of prohibitions. Framed as
-- care, which is how the sources frame it.

update public.lesson_series set
  title = 'The body, and looking after it',
  description = 'Three readings on health as care rather than as a rule.'
where id = '11110000-0000-4000-8000-00000000000d';

update public.lessons set
  title = 'Someone worth taking care of',
  body = 'A lot of religious talk about the body is about restraint. The starting point here is different: that the body is worth looking after because the person in it is.

**Read:** 1 Corinthians 6, verses 19 and 20, and then 3 John, verse 2.

The second one is a greeting in a letter — the writer says he hopes his friend is well in body as much as in every other way. It is an ordinary human wish, and it is in the Bible without any conditions attached.

**To think about:** do you look after yourself the way you would look after someone you were responsible for? Where is the gap widest?

**Where this comes from:** the 28 Fundamental Beliefs, number 22, "Christian Behavior", puts the body under care rather than under rules — adventist.org/beliefs. Ellen White''s *The Ministry of Healing* (1905) is the longer treatment, free from the Ellen G. White Estate at whiteestate.org'
where series_id = '11110000-0000-4000-8000-00000000000d' and position = 1;

update public.lessons set
  title = 'Four young men and a request',
  body = 'This is the passage most often quoted at people, and it is usually quoted with the interesting part left out.

**Read:** Daniel 1, verses 8 to 16.

Daniel does not denounce anybody. He asks — politely, of a nervous official — for a ten-day trial, and offers to be judged on the result. He makes a choice for himself and does not make it for anyone else.

**To think about:** the manner matters as much as the choice here. Is there something you would like to try for ten days and then judge honestly?

**Where this comes from:** this is the passage behind the Adventist health emphasis and the reason the church runs hospitals and health work rather than merely holding an opinion. See the 28 Fundamental Beliefs, number 22: adventist.org/beliefs'
where series_id = '11110000-0000-4000-8000-00000000000d' and position = 2;

update public.lessons set
  title = 'Rest, food, and the people around you',
  body = 'Health talk narrows quickly to diet. The sources behind this one are broader, and they were broader a hundred years before the research agreed.

**Read:** Genesis 1, verse 29, and Mark 6, verse 31.

The second one is Jesus telling exhausted people to come away and rest, and the reason given is simply that they had not had a chance to eat. Nothing spiritual is claimed for it. They were tired and hungry, and that was reason enough.

**To think about:** of sleep, food, movement, sunlight, water, and people who know you — which one have you been neglecting longest? Start with that one rather than the one that would look most impressive.

**Where this comes from:** Ellen White''s *The Ministry of Healing* (1905) makes rest, food, water, sunlight, air, exercise and trust a single subject rather than seven. Free from the Ellen G. White Estate: whiteestate.org'
where series_id = '11110000-0000-4000-8000-00000000000d' and position = 3;

commit;
