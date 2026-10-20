import { describe, expect, it } from 'vitest';
import { CreateEventSchema, UpdateEventSchema, type EventContactVisibility } from '@schichtplan/shared';

function redactResponsible(
  u: {
    id: string;
    firstName: string;
    lastName: string;
    ceviName?: string | null;
    phone?: string | null;
    email?: string | null;
  },
  contactVisibility: EventContactVisibility = 'BOTH'
) {
  const allowPhone = contactVisibility === 'BOTH' || contactVisibility === 'PHONE';
  const allowEmail = contactVisibility === 'BOTH' || contactVisibility === 'EMAIL';
  return {
    id: u.id,
    displayName: u.ceviName ? `${u.firstName} / ${u.ceviName}` : `${u.firstName} ${u.lastName}`,
    firstName: u.firstName,
    lastName: u.lastName,
    ceviName: u.ceviName,
    phone: allowPhone ? u.phone : null,
    email: allowEmail ? u.email : null,
  };
}

describe('Event contactVisibility', () => {
  const samplePerson = {
    id: 'usr-1',
    firstName: 'Max',
    lastName: 'Muster',
    ceviName: 'Fuchs',
    phone: '079 123 45 67',
    email: 'max@example.com',
  };

  it('redacts both phone and email when contactVisibility is NONE', () => {
    const res = redactResponsible(samplePerson, 'NONE');
    expect(res.phone).toBeNull();
    expect(res.email).toBeNull();
    expect(res.displayName).toBe('Max / Fuchs');
  });

  it('keeps only phone when contactVisibility is PHONE', () => {
    const res = redactResponsible(samplePerson, 'PHONE');
    expect(res.phone).toBe('079 123 45 67');
    expect(res.email).toBeNull();
  });

  it('keeps only email when contactVisibility is EMAIL', () => {
    const res = redactResponsible(samplePerson, 'EMAIL');
    expect(res.phone).toBeNull();
    expect(res.email).toBe('max@example.com');
  });

  it('keeps both phone and email when contactVisibility is BOTH', () => {
    const res = redactResponsible(samplePerson, 'BOTH');
    expect(res.phone).toBe('079 123 45 67');
    expect(res.email).toBe('max@example.com');
  });

  it('validates contactVisibility in CreateEventSchema', () => {
    const base = {
      title: 'Sommerfest',
      slug: 'sommerfest-2026',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    };

    expect(CreateEventSchema.safeParse({ ...base, contactVisibility: 'BOTH' }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...base, contactVisibility: 'PHONE' }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...base, contactVisibility: 'EMAIL' }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...base, contactVisibility: 'NONE' }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...base, contactVisibility: 'INVALID' }).success).toBe(false);
  });

  it('validates contactVisibility in UpdateEventSchema', () => {
    expect(UpdateEventSchema.safeParse({ contactVisibility: 'NONE' }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ contactVisibility: 'INVALID' }).success).toBe(false);
  });
});
