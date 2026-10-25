import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { answersExpireAt, purgeExpiredAnswers } from '../src/services/answerRetention.js';
import { createDepartment, createEvent, createShift, createTestApp, createUser, hasTestDb, resetDb } from './helpers.js';

describe('answersExpireAt', () => {
  it('zählt ab Anlass-Ende, null heisst nie', () => {
    const end = new Date('2030-06-02T20:00:00Z');
    expect(answersExpireAt(end, 0)).toEqual(end);
    expect(answersExpireAt(end, 10)).toEqual(new Date('2030-06-12T20:00:00Z'));
    expect(answersExpireAt(end, null)).toBeNull();
  });
});

describe.skipIf(!hasTestDb)('purgeExpiredAnswers', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('löscht Antworten nach der Frist, die Fragen bleiben', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id); // Ende 2030-06-02T20:00Z
    const shift = await createShift(app, event.id);
    const user = await createUser(app);
    const signup = await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: user.id } });

    const question = (label: string, retentionDays: number | null, scope = 'ONCE') =>
      app.prisma.eventQuestion.create({ data: { eventId: event.id, label, retentionDays, scope } });
    const now = await question('Allergien', 0);
    const later = await question('Adresse', 10);
    const never = await question('T-Shirt', null);
    const perSignup = await question('Auto?', 0, 'PER_SIGNUP');
    for (const q of [now, later, never]) {
      await app.prisma.eventAnswer.create({ data: { eventId: event.id, questionId: q.id, userId: user.id, value: 'x' } });
    }
    await app.prisma.shiftSignupAnswer.create({ data: { signupId: signup.id, questionId: perSignup.id, value: 'JA' } });

    // Während des Anlasses bleibt alles
    expect(await purgeExpiredAnswers(app.prisma, new Date('2030-06-02T10:00:00Z'))).toBe(0);

    // Direkt nach dem Ende: «0 Tage» weg (einmalig und pro Eintragung)
    expect(await purgeExpiredAnswers(app.prisma, new Date('2030-06-02T21:00:00Z'))).toBe(2);
    expect(await app.prisma.eventAnswer.count()).toBe(2);
    expect(await app.prisma.shiftSignupAnswer.count()).toBe(0);

    // Nach 10 Tagen: auch «10 Tage», «nie» bleibt
    expect(await purgeExpiredAnswers(app.prisma, new Date('2030-06-13T00:00:00Z'))).toBe(1);
    const left = await app.prisma.eventAnswer.findMany({ select: { questionId: true } });
    expect(left).toEqual([{ questionId: never.id }]);
    expect(await app.prisma.eventQuestion.count()).toBe(4);
  });
});
