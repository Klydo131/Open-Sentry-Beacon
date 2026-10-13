import { APP_NAME } from '@/lib/brand';

// WHAT A PERSON AGREES TO, IN ONE PLACE (13 October 2026).
//
// The sign-up page (components/live/DoorPages.tsx) asked for this, and it was
// the only place that did. Somebody who signed in with the password from their
// invitation never passed through that page, so the app held their information
// without ever having asked: on the live church, 42 of 43 accounts had no
// consent on record. The same words now stand behind the sign-up's box and the
// consent step every signed-in member without a record meets
// (components/live/ConsentStep.tsx), so the two cannot come to ask for
// different things.
//
// WHAT IS BEING AGREED TO, SPECIFICALLY. Contact details alone would not cover
// it: the app also keeps what a person tells their Guide and their place on the
// journey, and being in a church's discipleship app at all is a religious
// affiliation, sensitive personal information under the Act, for which consent
// must be specific and informed (section 13; NPC Circular 2023-04).
export function ConsentWording({ churchName }: { churchName: string }) {
  return (
    <>
      I give permission for <strong>{churchName || 'my church'}</strong> to
      keep and use my information in {APP_NAME} for one-to-one discipleship
      and the church&rsquo;s ministry: my name and contact details, what I
      choose to share with my Guide, and my place on the journey. I
      understand this shows my connection with the church. I can update my
      details whenever I need to, I will keep them truthful, and my Guide and
      my church&rsquo;s leadership can see when I change them.
    </>
  );
}
