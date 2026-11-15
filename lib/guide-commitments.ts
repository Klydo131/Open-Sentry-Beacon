// The Guide commitments: what a Guide promises before walking with anyone.
//
// Short on purpose, and firm on purpose. Each line is one thing a Guide does or
// never does, in words a volunteer cannot misread.
//
// SINCE 16 NOVEMBER 2026 THEY ARE AGREED IN THE INVITATION E-MAIL, which
// carries a copy (supabase/functions/invite/email.ts, held equal by
// tests/invite-emails.mjs), and read again in Settings (components/SourceCard.tsx).
// The app no longer stops a Guide on their desk to sign them.


export const COMMITMENTS: readonly { title: string; detail: string }[] = [
  { title: 'Every conversation stays in this app.', detail: 'I never move an Explorer to a private chat, phone call or social media without their Director knowing.' },
  { title: 'Never alone with a young person.', detail: 'With anyone under 18, I never meet in private, and a parent or guardian knows we are studying together.' },
  { title: 'Harm is reported the same day.', detail: 'If I see any sign of abuse, harm or danger, I tell a Director that day, and I never promise to keep that kind of secret.' },
  { title: 'What is shared with me stays private.', detail: 'I never post an Explorer’s name, photo or story without their permission.' },
  { title: 'No pressure, no favours, no romance.', detail: 'I do not give or take money or gifts, I keep to the role of a Guide, and I stop when someone says stop.' },
  { title: 'I follow the church’s safeguarding policy.', detail: 'I complete its training when asked, and I accept that breaking these commitments ends my work as a Guide.' },
];
