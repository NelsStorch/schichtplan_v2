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
  updatedAt: new Date('2026-08-01T10:00:00Z'),
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

  it('verrät nichts über Entwürfe, interne, Leitenden- oder eingeschränkte Anlässe', () => {
    expect(toEventPreview({ ...base, isPublished: false }, now)).toBeNull();
    expect(toEventPreview({ ...base, leadersOnly: true }, now)).toBeNull();
    for (const accessType of ['DEPARTMENT', 'DEPARTMENT_CEVIDB', 'CEVIDB_ALL', 'WHITELIST', 'WHITELIST_CEVIDB']) {
      expect(toEventPreview({ ...base, accessType }, now)).toBeNull();
    }
  });

  it('zeigt keine freien Plätze, wenn das Eintragen geschlossen oder der Anlass vorbei ist', () => {
    expect(toEventPreview({ ...base, allowPublicSignup: false }, now)?.openSlots).toBeNull();
    expect(toEventPreview(base, new Date('2026-09-01T00:00:00Z'))?.openSlots).toBeNull();
  });
});
