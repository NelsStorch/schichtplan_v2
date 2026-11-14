import { describe, expect, it } from 'vitest';
import { toEventPreview, type EventPreviewSource } from './eventPreview.js';

const base: EventPreviewSource = {
  title: 'Chilbi 2026',
  slug: 'chilbi-2026',
  logoUrl: null,
  startDate: new Date('2026-08-21T16:00:00Z'),
  endDate: new Date('2026-08-23T22:00:00Z'),
  dayCutoffTime: '04:00',
  isPublished: true,
  accessType: 'PUBLIC',
  leadersOnly: false,
  allowPublicSignup: true,
  allowReplacement: true,
  replacementCutoffHours: 0,
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  bannerUrl: '/images/banners/chilbi.svg',
  shifts: [
    { requiredSlots: 4, _count: { signups: 1 } },
    { requiredSlots: 2, _count: { signups: 5 } }, // überbucht zählt nicht negativ
    { requiredSlots: 3, _count: { signups: 0 } },
  ],
};
const now = new Date('2026-08-10T12:00:00Z');

describe('toEventPreview', () => {
  it('liefert Titel, Zeitraum und freie Plätze für öffentliche Anlässe', () => {
    const preview = toEventPreview(base, now);
    expect(preview).toMatchObject({ title: 'Chilbi 2026', slug: 'chilbi-2026', openSlots: 6 });
  });

  it('verrät nichts über Entwürfe', () => {
    expect(toEventPreview({ ...base, isPublished: false }, now)).toBeNull();
  });

  it('zeigt interne Anlässe wie die Anlass-Seite ohne Login, ausser bei Abteilungen «nur für Mitglieder»', () => {
    for (const accessType of ['DEPARTMENT', 'DEPARTMENT_CEVIDB', 'WHITELIST', 'WHITELIST_CEVIDB']) {
      expect(toEventPreview({ ...base, accessType }, now)?.title).toBe('Chilbi 2026');
      expect(toEventPreview({ ...base, accessType }, now, null, true)).toBeNull();
    }
    expect(toEventPreview({ ...base, leadersOnly: true }, now)?.title).toBe('Chilbi 2026');
    // Öffentliche (und Cevi.DB-weite) Anlässe bleiben auch dort über den Link sichtbar
    expect(toEventPreview(base, now, null, true)?.title).toBe('Chilbi 2026');
    expect(toEventPreview({ ...base, accessType: 'CEVIDB_ALL' }, now, null, true)?.title).toBe('Chilbi 2026');
  });

  it('zeigt keine freien Plätze, wenn das Eintragen geschlossen oder der Anlass vorbei ist', () => {
    expect(toEventPreview({ ...base, allowPublicSignup: false }, now)?.openSlots).toBeNull();
    expect(toEventPreview(base, new Date('2026-09-01T00:00:00Z'))?.openSlots).toBeNull();
  });

  it('beschreibt eine einzelne Schicht mit Titel und freien Plätzen', () => {
    const shift = {
      id: 's1',
      title: null,
      category: 'Bar',
      startTime: new Date('2026-08-22T16:00:00Z'),
      endTime: new Date('2026-08-22T20:00:00Z'),
      requiredSlots: 4,
      _count: { signups: 1 },
      tasks: [{ title: 'Bar ausschenken' }],
      signups: [{ id: 'x' }],
    };
    expect(toEventPreview(base, now, shift)?.shift).toMatchObject({ title: 'Bar ausschenken', openSlots: 3 });
    expect(toEventPreview(base, now, { ...shift, tasks: [] })?.shift?.title).toBe('Bar');
    expect(toEventPreview(base, now, { ...shift, category: null, tasks: [] })?.shift?.title).toBe('Schicht');
    expect(toEventPreview({ ...base, accessType: 'DEPARTMENT' }, now, shift, true)).toBeNull();
  });

  it('zählt «Ersatz gesucht» nur, solange Ersatz erlaubt und die Frist offen ist', () => {
    const shift = {
      id: 's1',
      title: 'Bar',
      category: null,
      startTime: new Date('2026-08-22T16:00:00Z'),
      endTime: new Date('2026-08-22T20:00:00Z'),
      requiredSlots: 2,
      _count: { signups: 2 },
      tasks: [],
      signups: [{ id: 'a' }],
    };
    expect(toEventPreview(base, now, shift)?.shift?.replacementWanted).toBe(1);
    expect(toEventPreview({ ...base, allowReplacement: false }, now, shift)?.shift?.replacementWanted).toBe(0);
    expect(toEventPreview(base, new Date('2026-08-22T17:00:00Z'), shift)?.shift?.replacementWanted).toBe(0);
  });
});
