# Live presentation runbook

The live church app and the sample tutorial are two different experiences.
Never use the tutorial as the sign-in path: on a configured live deployment,
**Sign in** always opens an e-mail and password form.

## Before the room arrives

1. Open the live deployment in a desktop browser and sign in as the Executive
   Director.
2. Keep the sample-data deployment in another tab as the offline fallback and
   feature tour. Its tutorial is intentionally not part of live sign-in.
3. Prepare two inbox addresses you can open: one Guide and one Explorer. Gmail
   plus aliases are useful, for example `yourname+guide@gmail.com` and
   `yourname+explorer@gmail.com`.
4. Send the two invitations before the presentation as a safeguard against
   venue Wi-Fi or mail delays. You can also send one fresh invitation live.

## The ten-minute live story

1. **The gateway:** tap **Sign in** on desktop, then on a phone. Point out that
   both ask only for e-mail and password—no tutorial and no sample role picker.
2. **Governance:** as Executive Director, invite a Guide. Only an Executive
   Director can invite a Director; a Director can invite Guides and Explorers.
3. **Mailbox:** open the Guide's invitation, set a password, and show the
   awaiting-approval screen.
4. **Approval:** return to the Executive Director screen and approve the Guide.
   The Guide can now sign in and reaches only the Guide workspace.
5. **Recommendation:** invite an Explorer and select that Guide. Open the
   invitation on a phone, set the Explorer's password, then approve the account.
   Pairing is created only after approval, at Connect.
6. **Two devices:** send a message from the Guide's desktop and reply from the
   Explorer's phone. The Explorer sees the relationship, but never the church's
   private journey-stage note.
7. **Open source:** finish at the GitHub repository and `CONTRIBUTING.md`. Show
   that another church can fork the code, create its own Supabase project, add
   its own Vercel variables, and keep its congregation's data in its own project.

## If mail or Wi-Fi is slow

Use the invitation already sent before the session. If the live path is not
healthy, switch openly to the sample-data deployment and say that it is the
offline feature tour. Do not make sample data look like the live church system.

## Final checks

- Live home has one **Sign in** button.
- Live sign-in has e-mail and password fields.
- Invitation opens `/join` and sets a password.
- New member sees **awaiting approval** before any workspace.
- Director/Executive Director can approve; Guide and Explorer cannot.
- Guide/Explorer pairing appears only after approval.
- Desktop and phone layouts do not scroll sideways.
