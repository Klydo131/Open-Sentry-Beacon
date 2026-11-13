'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveProfilePage } from '@/components/LiveAccountPages';
import { useIsLive } from '@/lib/tutorial';
import { Avatar, Button, Card } from '@/components/ui';
import { roleLabel } from '@/lib/brand';
import type { Role } from '@/lib/types';

// Executives included.
//
// Every one of these lists omitted 'executive', so a church director could not
// open their own settings or their own profile: the shell bounced them to the
// login screen. Same fault as /admin, three routes deep, and invisible for the
// same reason — there was no executive persona to sign in as until now.
const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

const AVATARS = ['🙂', '😊', '🧑', '👩', '👨', '🧕', '👵', '👴', '🌱', '✝️', '📖', '🕊️', '🙏', '⭐'];

// A distinct look per role, so an Admin's profile reads differently from a DS's.
// The green and blue were deepened on 6 October 2026 so white writing reads on
// them: 5.5:1 and 5.7:1, from 2.6:1 and 3.9:1.
const ROLE_STYLE: Record<Role, { bg: string; icon: string; blurb: string }> = {
  executive: { bg: '#0F172A', icon: '⭐', blurb: 'Executive admin. Oversees all churches.' },
  admin: { bg: '#1E2A4A', icon: '🛡️', blurb: 'Church coordinator. Full access.' },
  dm: { bg: '#1F5FD6', icon: '🤝', blurb: 'Guide. Walks with people, one at a time.' },
  ds: { bg: '#47741A', icon: '🌱', blurb: 'Exploring faith at your own pace.' },
};

export default function ProfilePage() {
  // The live editor is a separate component rather than a branch inside this
  // one: the tutorial keeps an avatar and an uploaded picture in browser
  // storage and the profiles table has columns for neither, so the two are not
  // the same form with a different backend.
  if (useIsLive()) {
    return (
      <LiveAppShell allow={ALL}>
        <LiveProfilePage />
      </LiveAppShell>
    );
  }
  return (
    <AppShell allow={ALL}>
      <Editor />
    </AppShell>
  );
}

function Editor() {
  const { currentUser, updateProfile } = useDemo();
  const me = currentUser!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

  const [f, setF] = useState({
    full_name: me.full_name ?? '',
    preferred_contact: me.preferred_contact ?? '',
    birthday: me.birthday ?? '',
    gender: me.gender ?? '',
    status: me.status ?? '',
    topics: (me.topics_of_interest ?? []).join(', '),
    city_of_residence: me.city_of_residence ?? '',
    work_industry: me.work_industry ?? '',
  });
  const [avatar, setAvatar] = useState(me.avatar);
  const [photo, setPhoto] = useState(me.photo);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setSaved(false);
  };

  // Downscale an uploaded picture to 256px so it stays small on-device.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = 256 / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        setPhoto(c.toDataURL('image/jpeg', 0.82));
        setAvatar(undefined);
        setSaved(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    updateProfile({
      full_name: f.full_name.trim() || me.full_name,
      preferred_contact: f.preferred_contact,
      birthday: f.birthday || undefined,
      gender: f.gender,
      status: f.status,
      topics_of_interest: f.topics
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      city_of_residence: f.city_of_residence,
      work_industry: f.work_industry,
      avatar,
      photo,
    });
    setSaved(true);
  };

  const rs = ROLE_STYLE[me.role];

  return (
    <div className="space-y-6">
      {/* Role-distinct header */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 p-5 text-white" style={{ backgroundColor: rs.bg }}>
          <Avatar name={f.full_name || me.full_name} size={72} photo={photo} avatar={avatar} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold">
              {f.full_name || me.full_name}
            </h1>
            <p className="text-white/90">
              {rs.icon}
              {roleLabel(me.role, me.role) ? ` ${roleLabel(me.role, me.role)}` : ''}
            </p>
            <p className="text-sm text-white/85">{rs.blurb}</p>
          </div>
        </div>

        {/* Picture / avatar picker */}
        <div className="p-5">
          <p className="mb-2 font-bold text-navy">Your picture</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              📷 Upload photo
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
            {(photo || avatar) && (
              <button
                onClick={() => {
                  setPhoto(undefined);
                  setAvatar(undefined);
                  setSaved(false);
                }}
                className="text-sm text-gray-500 underline"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mb-2 mt-4 text-sm text-gray-500">…or choose an avatar</p>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAvatar(a);
                  setPhoto(undefined);
                  setSaved(false);
                }}
                className="grid h-11 w-11 place-items-center rounded-full text-2xl ring-2"
                // Its ink beside its ground: a phone that draws an emoji in
                // plain ink drew it pale on this pale circle in a dark look.
                style={{
                  backgroundColor: avatar === a ? '#E8B84B' : '#EEF1F7',
                  color: '#1E2A4A',
                  borderColor: 'transparent',
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* The client's requested fields */}
      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold text-navy">Profile details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" value={f.full_name} onChange={set('full_name')} />
          <Field
            label="Preferred contact"
            value={f.preferred_contact}
            onChange={set('preferred_contact')}
            placeholder="Email, phone, Messenger…"
          />
          <Field label="Birthday" type="date" value={f.birthday} onChange={set('birthday')} />
          <Field label="Gender" value={f.gender} onChange={set('gender')} />
          <Field label="Status" value={f.status} onChange={set('status')} />
          <Field
            label="City of residence"
            value={f.city_of_residence}
            onChange={set('city_of_residence')}
          />
          <Field
            label="Work / Industry"
            value={f.work_industry}
            onChange={set('work_industry')}
          />
          <Field
            label="Topics of interest"
            value={f.topics}
            onChange={set('topics')}
            placeholder="Comma-separated"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="gold" onClick={save}>
            Save profile
          </Button>
          {/* Settings is off the phone header to make room for Mail, so it
              needs a door here. */}
          <Link href="/settings" className="lg:hidden">
            <span className="tap inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 text-base font-semibold text-navy">
              ⚙️ Settings
            </span>
          </Link>
          {saved && <span className="font-semibold text-green-600">✓ Saved</span>}
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
      />
    </label>
  );
}
