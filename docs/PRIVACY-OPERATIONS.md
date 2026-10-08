# Privacy operations: operator draft

Complete and approve this record before collecting member information. This is
an operating template, not a compliance certificate. Keep names, contracts,
incident evidence and member requests in the operator's restricted records,
never in this public repository.

## Name the people responsible

Record the controller's legal name/address, privacy officer and backup contact,
technical incident lead, backup administrator, and person authorized to notify
regulators and affected people. Publish only the public controller, privacy
contact and hosting facts using the three fields in `.env.example`. Confirm
that someone monitors the published contact and can act when the owner is away.

Leadership roles do not grant conversation access. Give technical access only
to designated administrators who need it, record that access, protect their
accounts, and remove access when their responsibility ends. Submitted
safeguarding evidence has its own authorized handling; it does not grant access
to the conversation feed.

## Decide retention and rights handling

For each category in `DATA-PROTECTION.md`, record its purpose, applicable lawful
basis, retention period, review owner, deletion method and any legal hold. Include
study attachments, safeguarding evidence, removal records, logs and backups.
Do not treat the absence of automatic deletion as permission to retain forever.
Record processor agreements, countries, transfer safeguards and the actual
backup schedule, expiry and restoration procedure.

Log a rights request privately, verify identity proportionately, locate its
scope, and record the applicable response deadline. Provide the member's export
where appropriate; review retained evidence, third-party information and backups
before promising complete erasure. Explain a lawful restriction and the complaint
route. After restoring a backup, reapply completed deletion requests and access
revocations before opening the service. Test this with fictional records.

## Handle an incident

1. Notify the designated privacy officer and technical lead immediately. Record
   when the incident was discovered, affected systems and what is known. Keep
   evidence and communications restricted; do not post member data in an issue.
2. Contain the affected service or credentials, preserve relevant evidence and
   document each action. Avoid deleting evidence or restoring access prematurely.
3. Assess affected information, unauthorized acquisition and risk of harm.
   Document the notification decision and applicable jurisdiction/deadlines.
   Philippine notification criteria and the 72-hour period are described in
   [NPC breach reporting](https://privacy.gov.ph/pips-and-pics/breach-reporting/)
   and [Circular 16-03](https://privacy.gov.ph/wp-content/uploads/2022/01/sgd-npc-circular-16-03-personal-data-breach-management.pdf).
   Do not wait for a complete investigation when an initial notification is due.
4. The authorized person sends any required notification securely, records
   receipt, provides follow-up information and gives affected people practical
   protective steps. This template does not send any notification automatically.
5. Repair and verify the boundary, restore safely, review the cause and rehearse
   the updated procedure. Record the incident even when notification is not required.

## Complete the release record

Record operator approval, jurisdiction/registration assessment, minors/guardian
process, processor review, retention decisions and the last fictional incident
and backup-restoration rehearsals. Keep unfinished items explicit. Test the
security migrations and role/API controls in throwaway Supabase and staging;
repository checks alone do not establish the state of the deployed service.
