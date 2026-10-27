'use client';

// Reporting somebody, in the moment you decide to.
//
// The hard part of this is not the form. It is that a person about to use it is
// upset, unsure whether it "counts", and afraid of what happens next. Every
// choice here is aimed at that:
//
//   * WHAT HAPPENS IS STATED BEFORE THEY TYPE, not after they submit. The
//     facts that decide whether somebody reports at all are who is told and
//     when, so they are the first thing on screen: the other person is not told
//     when it is sent, a Director reads it first and may then bring them into
//     the conversation about it, and the person reporting is told if so
//     (20261027130000_a_report_is_one_conversation; until 27 October 2026 the
//     other person was never told at all, and reports made then stay that way).
//   * THE DETAIL BOX IS OPTIONAL. Requiring an explanation asks the person to
//     write down the thing they are upset about before they are ready, and
//     some will close the dialog instead.
//   * NO "ARE YOU SURE?". A confirmation step reads as the app doubting them.
//     Reporting is reversible in the sense that matters — a Director can close
//     it as nothing to answer — so there is nothing to guard against.
//   * IT CANNOT BE FIRED BY A MIS-TAP. The control that opens it is a plain
//     text link, not a button sitting next to Send.

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ReportReason } from '@/lib/types';
import { Button, Card } from '@/components/ui';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  {
    value: 'inappropriate',
    label: 'Something inappropriate was sent',
    hint: 'Sexual, obscene, or otherwise not right for this place.',
  },
  {
    value: 'harassment',
    label: 'Abuse, threats or pressure',
    hint: 'Insults, intimidation, or being pushed to do something.',
  },
  {
    value: 'unsafe',
    label: 'I am worried someone is unsafe',
    hint: 'Including the person I am reporting.',
  },
  {
    value: 'spam',
    label: 'Selling, begging or recruiting',
    hint: 'Asking for money, or promoting something.',
  },
  {
    value: 'other',
    label: 'Something else',
    hint: 'It does not have to fit a box.',
  },
];

export function ReportDialog({
  subjectName,
  hiddenSubject = false,
  onCancel,
  onSubmit,
}: {
  subjectName: string;
  /**
   * The guild board shows "A Guide" and "A fellow Explorer" instead of names,
   * so the person reporting a post there genuinely does not know whose it is.
   * Every sentence below names the subject, and "Melody is not told" turns
   * into "this post is not told" if it is left alone. With this set, the
   * copy talks about whoever wrote it instead.
   */
  hiddenSubject?: boolean;
  onCancel: () => void;
  onSubmit: (reason: ReportReason, detail: string, evidence: File[]) => void;
}) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [evidence, setEvidence] = useState<File[]>([]);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (sent) {
    return (
      <Card className="p-5 ring-2 ring-green-300">
        <h3 className="text-lg font-bold text-navy">Reported. Thank you.</h3>
        <p className="mt-2 text-gray-700">
          Your church&rsquo;s Directors have been told.{' '}
          {hiddenSubject ? 'Whoever wrote it has not been' : `${subjectName} has not`}.
          A Director reads it first. If they bring them into the conversation
          about it, you will be told.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          {hiddenSubject
            ? 'A Director can take the post down. You do not have to look at it again.'
            : 'You do not have to keep talking to them while this is looked at.'}
        </p>
        <Button variant="ghost" className="mt-4" onClick={onCancel}>
          Close
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 ring-2 ring-amber-300">
      <h3 className="text-lg font-bold text-navy">Report {subjectName}</h3>

      {/* Before anything is asked for. This is the sentence that decides
          whether a frightened person goes through with it. */}
      <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-200">
        This goes to your church&rsquo;s Directors.{' '}
        <strong>
          {hiddenSubject ? 'Whoever wrote it is not told' : `${subjectName} is not told`}
        </strong>{' '}when you send it. A Director reads it first, and may then bring
        them into the conversation about it so it can be talked through; you will
        be told if they do. They never see the pictures or files you add.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-navy">
          What happened? Pick the closest one.
        </legend>
        <div className="mt-2 space-y-2">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ${
                reason === r.value ? 'bg-amber-50 ring-amber-300' : 'bg-gray-50 ring-transparent'
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                className="mt-1"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              <span>
                <span className="block font-semibold text-navy">{r.label}</span>
                <span className="block text-sm text-gray-600">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-navy">
          Anything you want to add <span className="font-normal text-gray-500">(optional)</span>
        </span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          placeholder="You do not have to explain. Only if it helps."
          className="mt-1 w-full rounded-xl bg-gray-100 p-3 text-base outline-none focus:ring-2 focus:ring-gold"
        />
      </label>

      {/* EVIDENCE, AND WHY IT IS OPTIONAL AND LAST.
          The thing being reported is very often a picture, a screenshot of a
          conversation, a voice note or a document — and until now the person
          holding it on their phone was asked to describe it in words, and a
          Director decided on that description alone.
          It sits below the written account and says "optional" twice, because
          somebody frightened enough to be on this screen must never feel the
          report will not be taken seriously without proof. */}
      <div className="mt-4 rounded-xl bg-gray-50 p-3 ring-1 ring-black/5">
        <p className="text-sm font-semibold text-navy">
          Attach anything that shows what happened{' '}
          <span className="font-normal text-gray-500">(optional)</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">
          A screenshot, a photo, a recording, a document. Only your church&rsquo;s
          Directors can open these. Up to 10 MB each.
        </p>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            // Appended, not replaced: picking a second time on a phone opens a
            // fresh picker, and replacing would silently drop the first choice.
            if (chosen.length) setEvidence((was) => [...was, ...chosen]);
            // Cleared on the way OUT here rather than on the way in, because
            // nothing reads the bytes until the report is sent.
            event.target.value = '';
          }}
        />
        <Button variant="ghost" className="mt-3" onClick={() => fileRef.current?.click()}>
          Choose files
        </Button>

        {evidence.length > 0 && (
          <ul className="mt-3 space-y-1">
            {evidence.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-navy">📎 {f.name}</span>
                <button
                  type="button"
                  onClick={() => setEvidence((was) => was.filter((_, at) => at !== i))}
                  className="shrink-0 text-xs font-semibold text-red-700 underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="gold"
          disabled={!reason}
          onClick={() => {
            if (!reason) return;
            onSubmit(reason, detail, evidence);
            setSent(true);
          }}
        >
          Send this report
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Never mind
        </Button>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        If someone is in danger right now, call your local emergency services
        first.{' '}
        <Link href="/policy" className="underline underline-offset-2">
          How we treat each other
        </Link>
      </p>
    </Card>
  );
}
