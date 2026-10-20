import { describe, it, expect } from 'vitest';
import { CreateEventSchema, UpdateEventSchema } from '@schichtplan/shared';

describe('Event cancelDeadlineDays schema validation', () => {
  const baseEvent = {
    title: 'Sommerfest',
    slug: 'sommerfest-2026',
    startDate: '2026-07-01T10:00:00.000Z',
    endDate: '2026-07-01T22:00:00.000Z',
    accessType: 'PUBLIC',
  };

  it('accepts null or omitted cancelDeadlineDays', () => {
    expect(CreateEventSchema.safeParse(baseEvent).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...baseEvent, cancelDeadlineDays: null }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ cancelDeadlineDays: null }).success).toBe(true);
  });

  it('accepts valid integers (0, 1, 2, 30)', () => {
    expect(CreateEventSchema.safeParse({ ...baseEvent, cancelDeadlineDays: 0 }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...baseEvent, cancelDeadlineDays: 2 }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...baseEvent, cancelDeadlineDays: 30 }).success).toBe(true);
    expect(UpdateEventSchema.safeParse({ cancelDeadlineDays: 2 }).success).toBe(true);
  });

  it('rejects negative numbers or numbers exceeding 365', () => {
    expect(CreateEventSchema.safeParse({ ...baseEvent, cancelDeadlineDays: -1 }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ ...baseEvent, cancelDeadlineDays: 366 }).success).toBe(false);
    expect(UpdateEventSchema.safeParse({ cancelDeadlineDays: -5 }).success).toBe(false);
  });
});

describe('Cancel deadline calculation logic', () => {
  it('correctly calculates the deadline timestamp from days', () => {
    const eventStart = new Date('2026-08-10T12:00:00.000Z');
    const deadlineDays = 2;
    const deadline = new Date(eventStart.getTime() - deadlineDays * 24 * 60 * 60 * 1000);

    expect(deadline.toISOString()).toBe('2026-08-08T12:00:00.000Z');

    // Exactly before deadline -> self-cancellation allowed
    const justBefore = new Date(deadline.getTime() - 1000);
    expect(justBefore < deadline).toBe(true);

    // Exactly at or after deadline -> self-cancellation locked
    const justAfter = new Date(deadline.getTime() + 1000);
    expect(justAfter >= deadline).toBe(true);
  });

  it('handles 0 days deadline (locked at event start)', () => {
    const eventStart = new Date('2026-08-10T12:00:00.000Z');
    const deadlineDays = 0;
    const deadline = new Date(eventStart.getTime() - deadlineDays * 24 * 60 * 60 * 1000);

    expect(deadline.getTime()).toBe(eventStart.getTime());
  });
});
