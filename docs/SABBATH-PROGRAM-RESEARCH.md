# The Sabbath program: what other tools do, and what this one took

Asked for on 2 October 2026: "You can find open source tools and make it an
inspiration of it and let's make our own for the Sabbath school program tool,
make sure it's simple to use (with Advance settings of course) and have value
to give. Of course the output for Sabbath program can be share to Explorers
too. Probably it can be output to share design in Canva if it's needed for
design (make sure it's free and all, we dont want much cost and we dont want
any legal issues). Make sure the Sabbath program is accessible to all devices,
offline and online."

This is the record of that research: what was looked at, under which licence,
what was taken and what was not, and why. It sits beside
[`CHAT-RESEARCH.md`](./CHAT-RESEARCH.md), which did the same for the
conversation.

## Ideas, not code

Nothing below was copied. Every tool was read for what it does, not for how it
is written, and an idea carries no licence: copyright protects the expression,
not the feature. So none of their licences, including the two copyleft ones,
places any obligation on this app. They are listed so the next person can
check the same tools and see what was decided.

## The tools

| Tool | Licence | What it is | Read on |
| --- | --- | --- | --- |
| [OpenOrder](https://github.com/TheRevDrJ/OpenOrder) | AGPL-3.0 | A web tool that turns one form (hymns, scripture, sermon) into a print-ready Word bulletin and a PowerPoint | 2 October 2026 |
| [WorshipStudio](https://github.com/jeyeager65/WorshipStudio) | MIT | Service planning and presentation: the order of worship, templates, people and roles, a readiness check, printable bulletins, an installable web app | 2 October 2026 |
| [FreeShow](https://github.com/ChurchApps/FreeShow) | GPL-3.0 | A presenter for the big screen, with a separate stage display for whoever is speaking | 2 October 2026 |

## What was taken

| Idea | From | Here |
| --- | --- | --- |
| One form, several outputs | OpenOrder | One program gives a Word file, a picture, text for a group chat, and a post in the app |
| Hymnal copyright handled by the church, not the tool | OpenOrder | No hymn numbers, titles or words ship with the app; the church types what it sings |
| Templates you reuse | WorshipStudio | The four-part standard, and a church's own templates (Advanced) |
| A readiness check before the day | WorshipStudio | "N lines still need someone", on the program and in its list |
| People and roles for the week | WorshipStudio | Reminders: everyone taking part, each with a message ready to send (Advanced) |
| What the speaker sees is not what the congregation sees | FreeShow's stage display | A platform copy with start times and private notes, and a congregation copy without them (Advanced) |
| Works without a server or a signal | WorshipStudio's installable app | Programs live on the device, and the This Sabbath page opens without signal after one visit |

Minutes for each line, with the start time of every line worked out from them,
is what service planners generally offer; it is here as an Advanced setting.

**Details of your own** (Advanced) came from the owner the same day, not from
any of these tools: "users can add additional input in the advance settings if
the basic is not enough for them". A detail is a name and what it says, such as
"Deacons on duty: Anna Yu and Peter Tan", printed under the theme on every
copy, the picture and the post included. A template keeps the names of the
details and leaves what they said behind, the same way it leaves the names of
who leads each part.

## What was not taken, and why

- **Slides and projection.** A different product. Churches already have
  FreeShow and its peers, free.
- **Scripture text fetched from an online Bible.** It needs a network on the
  day it is least likely to be there, and the translations most churches read
  aloud need a licence or a key. A program names the passage; the reader has
  the Bible.
- **Hymn search and words.** The hymnal's numbering and words belong to its
  publisher.
- **A half-letter folded bulletin.** Word does it from the downloaded file
  (Layout, Margins, Multiple pages, Book fold). Building it in here would be
  layout code for one paper size.
- **A link anybody can open.** Considered for sending a program to Explorers,
  and refused: anybody could make one on the church's own web address saying
  anything. A program reaches Explorers as a post in the app instead, with the
  sender's name on it, readable only inside the church.

## Canva, without cost and without legal risk

**Nothing in the app talks to Canva.** It makes files that Canva's free plan
can open, and the person uploads them:

1. Download the program as a Word file, or as a picture.
2. In Canva (a free account is enough): Create a design, then Upload, then
   choose the file.

Why this and not a "Design in Canva" button:

- A button needs a Canva developer integration, registered and kept up by every
  church that copies this app, under Canva's developer terms. Some of what such
  an integration can do needs a paid Canva plan.
- Uploading a file needs none of that, costs nothing, and leaves the app with
  no keys to keep secret and no third party to disclose in the privacy notice.
- The app names Canva in its instructions and uses nothing else of Canva's: no
  logo, no templates, no API. What a church then adds inside Canva is governed
  by Canva's own content licence, between the church and Canva.

**What Canva accepts was not read from Canva directly.** Its help page on upload
formats (canva.com/help/upload-formats-requirements) could not be reached from
the machine this was built on; search results quoting it say the free plan
imports Word files (.doc, .docx, .dotx). Pictures (PNG) are the most ordinary
upload there is. Check it once on a real account before telling a church it
works.
