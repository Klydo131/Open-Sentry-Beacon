'use client';

import { useRef, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { useLocale } from '@/lib/i18n';
import { Card, Button } from '@/components/ui';
import { downloadBlob } from '@/lib/pdf';
import {
  serializeBackup,
  backupSlug,
  rosterCsv,
  parseBackup,
  type ParseResult,
} from '@/lib/backup';

// Admin-only "Church data" card: take a full backup out, keep a spreadsheet
// roster, and restore from a backup. A restore replaces everything, so it is
// deliberately a two-step, plain-language confirmation — no caveman shorthand.
export function DataManager() {
  const { db, importData } = useDemo();
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Extract<ParseResult, { ok: true }> | null>(null);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);

  const downloadBackup = () => {
    const blob = new Blob([serializeBackup(db)], { type: 'application/json' });
    downloadBlob(blob, `${backupSlug(db.church_name)}.json`);
  };

  const downloadRoster = () => {
    const blob = new Blob([rosterCsv(db)], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${backupSlug(db.church_name)}-roster.csv`);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setRestored(false);
    const file = e.target.files?.[0];
    if (!file) return;
    // Read BEFORE clearing. WebKit invalidates a File once its input is reset,
    // so clearing first made file.text() reject on Safari and iOS and restoring
    // a backup failed there while working in Chromium.
    const input = e.target;
    const text = await file.text();
    input.value = ''; // and now the same file can be chosen again

    const res = parseBackup(text);
    if (!res.ok) {
      setPending(null);
      setError(res.error);
      return;
    }
    setPending(res);
  };

  const confirmRestore = () => {
    if (!pending) return;
    importData(pending.db);
    setPending(null);
    setRestored(true);
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">💾 {t('churchData')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        Your church owns its data. Take a full backup any time, keep a
        spreadsheet of your Explorers, or restore from a backup.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="gold" onClick={downloadBackup}>
          ⬇️ Download full backup
        </Button>
        <Button variant="ghost" onClick={downloadRoster}>
          📊 Export Explorer roster (CSV)
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        The backup is a complete copy (everything). The roster is a simple
        spreadsheet of Explorers and their journey. It opens in Excel or
        Google Sheets.
      </p>

      <hr className="my-5 border-black/5" />

      <h3 className="text-lg font-bold text-navy">Restore from a backup</h3>
      <p className="mt-1 text-sm text-gray-500">
        This <strong>replaces all current data</strong> with the backup file.
        This cannot be undone, so download a backup first if you’re unsure.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        className="hidden"
      />

      {!pending && (
        <div className="mt-3">
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            📂 Choose a backup file…
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {pending && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">
            Restore “{pending.meta.church_name}”?
          </p>
          <p className="mt-1 text-sm text-amber-800">
            This backup has {pending.meta.profiles} people and{' '}
            {pending.meta.pairings} Explorer pairings
            {pending.meta.exported_at
              ? `, saved ${new Date(pending.meta.exported_at).toLocaleString()}`
              : ''}
            . Restoring will replace everything currently in the app and sign you
            out.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button variant="gold" onClick={confirmRestore}>
              Yes, replace all data
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {restored && (
        <p className="mt-3 font-semibold text-green-600">
          ✓ Data restored. Please sign in again.
        </p>
      )}
    </Card>
  );
}
