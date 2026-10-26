import { describe, expect, it } from 'vitest';
import {
  AdminMergeUserSchema,
  AdminUpdateUserSchema,
  CreateEventSchema,
  PLACEHOLDER_EMAIL_REGEX,
  SendEventMessageSchema,
  UpdateEventSchema,
  type EventContactVisibility,
} from '@schichtplan/shared';

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
  const allowEmail =
    (contactVisibility === 'BOTH' || contactVisibility === 'EMAIL') &&
    Boolean(u.email && !PLACEHOLDER_EMAIL_REGEX.test(u.email));
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

  it('redacts Cevi.DB placeholder email even when contactVisibility is BOTH or EMAIL', () => {
    const placeholderPerson = { ...samplePerson, email: 'cevidb_12345@cevi-schichtplan.ch' };
    expect(redactResponsible(placeholderPerson, 'BOTH').email).toBeNull();
    expect(redactResponsible(placeholderPerson, 'EMAIL').email).toBeNull();
    expect(redactResponsible(placeholderPerson, 'BOTH').phone).toBe('079 123 45 67');
  });

  it('validates SendEventMessageSchema targets including OPEN', () => {
    const baseMsg = { subject: 'Erinnerung', body: 'Bitte tragt euch in die offenen Schichten ein.' };
    const sampleId = '00000000-0000-4000-8000-000000000001';
    expect(SendEventMessageSchema.safeParse({ ...baseMsg, target: 'ALL' }).success).toBe(true);
    expect(SendEventMessageSchema.safeParse({ ...baseMsg, target: 'OPEN' }).success).toBe(true);
    expect(SendEventMessageSchema.safeParse({ ...baseMsg, target: 'SHIFTS', shiftIds: [sampleId] }).success).toBe(true);
    expect(SendEventMessageSchema.safeParse({ ...baseMsg, target: 'SHIFTS', shiftIds: [] }).success).toBe(false);
    expect(SendEventMessageSchema.safeParse({ ...baseMsg, target: 'PEOPLE', userIds: [sampleId] }).success).toBe(true);
    expect(SendEventMessageSchema.safeParse({ ...baseMsg, target: 'PEOPLE', userIds: [] }).success).toBe(false);
  });

  it('validates AdminUpdateUserSchema and AdminMergeUserSchema', () => {
    expect(AdminUpdateUserSchema.safeParse({ isGlobalAdmin: true }).success).toBe(true);
    expect(AdminUpdateUserSchema.safeParse({ homeDepartmentId: '00000000-0000-4000-8000-000000000001' }).success).toBe(true);
    expect(AdminUpdateUserSchema.safeParse({ homeDepartmentId: null }).success).toBe(true);
    expect(AdminUpdateUserSchema.safeParse({ isGlobalAdmin: 'nope' }).success).toBe(false);

    expect(AdminMergeUserSchema.safeParse({ targetUserId: '00000000-0000-4000-8000-000000000002' }).success).toBe(true);
    expect(AdminMergeUserSchema.safeParse({ targetUserId: 'not-a-uuid' }).success).toBe(false);
  });
});
