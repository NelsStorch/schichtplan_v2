import { describe, it, expect } from 'vitest';
import { CreateEventSchema, UpdateEventSchema, InstantiateTemplateSchema } from '@schichtplan/shared';

describe('Event signupOpensAt schema validation', () => {
  const baseEvent = {
    title: 'Frühlingsfest',
    slug: 'fruehlingsfest-2026',
    startDate: '2026-05-01T10:00:00.000Z',
    endDate: '2026-05-01T22:00:00.000Z',
    accessType: 'PUBLIC',
  };

  it('accepts null or omitted signupOpensAt', () => {
    expect(CreateEventSchema.safeParse(baseEvent).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...baseEvent, signupOpensAt: null }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ signupOpensAt: null }).success).toBe(true);
    expect(InstantiateTemplateSchema.safeParse({ ...baseEvent, signupOpensAt: null }).success).toBe(true);
  });

  it('accepts valid ISO datetime for signupOpensAt', () => {
    const opening = '2026-04-20T18:00:00.000Z';
    expect(CreateEventSchema.safeParse({ ...baseEvent, signupOpensAt: opening }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ signupOpensAt: opening }).success).toBe(true);
    expect(InstantiateTemplateSchema.safeParse({ ...baseEvent, signupOpensAt: opening }).success).toBe(true);
  });

  it('rejects invalid datetimes', () => {
    expect(CreateEventSchema.safeParse({ ...baseEvent, signupOpensAt: 'nicht-ein-datum' }).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ signupOpensAt: '2026-04-20' }).success).toBe(false); // braucht datetime
  });
});
