import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// Neutrale Demo-Daten für die lokale Entwicklung (keine echten Personen, Abteilungen oder Passwörter).
// Nur fehlende Daten anlegen, nie bestehende überschreiben (update: {}) oder löschen.
async function main() {
  console.log('Seede Cevi Schichtplan V2 Datenbank...');

  // 1. Demo-Abteilung
  const department = await prisma.department.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo-Abteilung',
      slug: 'demo',
      primaryColor: '#e11d48',
    },
  });

  console.log(`Abteilung angelegt: ${department.name} (${department.slug})`);

  // 2. Demo-Admin. Passwort aus SEED_PASSWORD oder zufällig (gilt nur für neu angelegte Konten)
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');
  const defaultPasswordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      firstName: 'Demo',
      lastName: 'Admin',
      ceviName: 'Demo-Admin',
      birthDate: new Date('2000-01-01'),
      isGlobalAdmin: true,
      passwordHash: defaultPasswordHash,
    },
  });

  await prisma.departmentMember.upsert({
    where: {
      departmentId_userId: {
        departmentId: department.id,
        userId: admin.id,
      },
    },
    update: {},
    create: {
      departmentId: department.id,
      userId: admin.id,
      role: 'ADMIN',
    },
  });

  console.log(`Demo-Admin: ${admin.email}`);
  if (!process.env.SEED_PASSWORD) console.log(`Passwort für neu angelegte Demo-Konten: ${password}`);

  // 3. Demo-Helfer (verschiedene Alter für die minAge-Prüfung: volljährig, 16+, unter 16)
  const helpersData = [1, 2, 3].map((n, i) => ({
    email: `helfer${n}@example.com`,
    firstName: 'Helfer',
    lastName: String(n),
    ceviName: `Helfer ${n}`,
    birthDate: new Date(['2000-01-01', '2009-01-01', '2012-01-01'][i]),
  }));

  const helperUsers = [];
  for (const h of helpersData) {
    const user = await prisma.user.upsert({
      where: { email: h.email },
      update: {},
      create: {
        email: h.email,
        firstName: h.firstName,
        lastName: h.lastName,
        ceviName: h.ceviName,
        birthDate: h.birthDate,
        passwordHash: defaultPasswordHash,
      },
    });

    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: {
          departmentId: department.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        departmentId: department.id,
        userId: user.id,
        role: 'HELPER',
      },
    });

    helperUsers.push(user);
  }

  // 4. Demo-Events
  // Event A: Chilbi 2026 (Demonstriert "NAME_ONLY" - Kein Passwort nötig!)
  const chilbi = await prisma.event.upsert({
    where: {
      departmentId_slug: {
        departmentId: department.id,
        slug: 'chilbi-2026',
      },
    },
    update: {},
    create: {
      departmentId: department.id,
      title: 'Chilbi 2026',
      slug: 'chilbi-2026',
      description:
        'Grill- und Getränkestand an der Chilbi. Hilf mit und unterstütze die Abteilung.',
      startDate: new Date('2026-10-16T16:00:00Z'),
      endDate: new Date('2026-10-18T22:00:00Z'),
      logoUrl: null,
      bannerUrl: '/images/banners/chilbi.svg',
      isPublished: true,
      allowPublicSignup: true,
      signupMode: 'NAME_ONLY',
    },
  });

  // Event OK für Chilbi
  await prisma.eventOrganizer.upsert({
    where: {
      eventId_userId: {
        eventId: chilbi.id,
        userId: admin.id,
      },
    },
    update: {},
    create: {
      eventId: chilbi.id,
      userId: admin.id,
      role: 'OK_LEAD',
      roleTitle: 'OK-Leitung',
    },
  });

  await prisma.eventOrganizer.upsert({
    where: {
      eventId_userId: {
        eventId: chilbi.id,
        userId: helperUsers[0].id,
      },
    },
    update: {},
    create: {
      eventId: chilbi.id,
      userId: helperUsers[0].id,
      role: 'OK_MEMBER',
      roleTitle: 'Bau & Technik',
    },
  });

  // Event B: Sommerlager 2026 (Demonstriert "LOGIN_REQUIRED")
  const sola = await prisma.event.upsert({
    where: {
      departmentId_slug: {
        departmentId: department.id,
        slug: 'sola-2026',
      },
    },
    update: {},
    create: {
      departmentId: department.id,
      title: 'Sommerlager 2026',
      slug: 'sola-2026',
      description:
        'Das Sommerlager der Abteilung. Unterstützung gesucht für Vortrupp, Küche und Rücktransport.',
      startDate: new Date('2026-07-11T08:00:00Z'),
      endDate: new Date('2026-07-18T18:00:00Z'),
      isPublished: true,
      allowPublicSignup: true,
      signupMode: 'LOGIN_REQUIRED',
    },
  });

  console.log(`Events angelegt: ${chilbi.title}, ${sola.title}`);

  // 5. Schichten für die Chilbi (nur beim ersten Seed: echte Schichten & Anmeldungen bleiben unangetastet)
  if ((await prisma.shift.count({ where: { eventId: chilbi.id } })) > 0) {
    console.log('Chilbi hat bereits Schichten, Beispielschichten werden übersprungen.');
    return;
  }

  const shiftsData = [
    {
      title: 'Standaufbau & Zeltmontage',
      category: 'Aufbau & Vorbereitung',
      description: 'Zelt aufstellen, Grill und Tische platzieren, Beleuchtung installieren.',
      startTime: new Date('2026-10-16T13:00:00Z'),
      endTime: new Date('2026-10-16T16:30:00Z'),
      requiredSlots: 4,
      minAge: null,
      tasks: [
        {
          title: 'Zeltbau & Schwere Arbeiten',
          description: 'Gerüst aufstellen, Planen spannen',
          requiredSlots: 2,
          minAge: 16,
          ageRequirementType: 'ALL' as const,
        },
        {
          title: 'Material & Deko',
          description: 'Tische, Bänke und Deko einrichten',
          requiredSlots: 2,
          minAge: null,
          ageRequirementType: 'ALL' as const,
        },
      ],
    },
    {
      title: 'Grillmeister Freitagabend',
      category: 'Grill & Essensausgabe',
      description: 'Würste, Steaks und Chnoblibrot grillieren. Für Nachschub sorgen.',
      startTime: new Date('2026-10-16T17:00:00Z'),
      endTime: new Date('2026-10-16T21:30:00Z'),
      requiredSlots: 3,
      minAge: null,
      tasks: [
        {
          title: 'Grillleitung',
          description: 'Fleisch und Grill bedienen',
          requiredSlots: 1,
          minAge: 16,
          ageRequirementType: 'ALL' as const,
        },
        {
          title: 'Ausgabe & Chnoblibrot',
          description: 'Bestellungen zusammenstellen und ausgeben',
          requiredSlots: 2,
          minAge: null,
          ageRequirementType: 'ALL' as const,
        },
      ],
    },
    {
      title: 'Bar & Ausschank Freitagabend',
      category: 'Bar & Getränke',
      description: 'Getränke ausgeben, Zapfanlage bedienen und Gläser abwaschen.',
      startTime: new Date('2026-10-16T18:00:00Z'),
      endTime: new Date('2026-10-16T23:30:00Z'),
      requiredSlots: 3,
      minAge: 16,
      tasks: [
        {
          title: 'Barleitung & Kasse',
          description: 'Spirituosen-Ausschank und Baraufsicht',
          requiredSlots: 1,
          minAge: 18,
          ageRequirementType: 'ALL' as const,
        },
        {
          title: 'Ausschank & Abwasch',
          description: 'Bier/Softdrinks und Gläserspülung (mindestens 1 Volljährige/r in Schicht)',
          requiredSlots: 2,
          minAge: 18,
          ageRequirementType: 'AT_LEAST_ONE' as const,
        },
      ],
    },
    {
      title: 'Kasse & Bons Samstag Nachmittag',
      category: 'Kasse & Bons',
      description: 'Bons verkaufen, Twint- und Barzahlung abwickeln.',
      startTime: new Date('2026-10-17T13:00:00Z'),
      endTime: new Date('2026-10-17T17:30:00Z'),
      requiredSlots: 2,
      minAge: 16,
      tasks: [
        {
          title: 'Hauptkasse',
          description: 'Bargeld und Twint abrechnen',
          requiredSlots: 2,
          minAge: 16,
          ageRequirementType: 'ALL' as const,
        },
      ],
    },
    {
      title: 'Grill & Küche Samstagabend',
      category: 'Grill & Essensausgabe',
      description: 'Hochbetrieb am Grill! Zügiges Arbeiten im Team.',
      startTime: new Date('2026-10-17T17:00:00Z'),
      endTime: new Date('2026-10-17T22:00:00Z'),
      requiredSlots: 4,
      minAge: null,
      tasks: [
        {
          title: 'Grill',
          description: 'Grillzange führen',
          requiredSlots: 2,
          minAge: null,
          ageRequirementType: 'ALL' as const,
        },
        {
          title: 'Küche & Nachschub',
          description: 'Salate und Nachschub richten',
          requiredSlots: 2,
          minAge: null,
          ageRequirementType: 'ALL' as const,
        },
      ],
    },
    {
      title: 'Chilbi Abbau & Endreinigung',
      category: 'Abbau & Aufräumen',
      description: 'Alles abbauen, Material im Cevi-Kasten verstauen, Platz sauber wischen.',
      startTime: new Date('2026-10-18T18:00:00Z'),
      endTime: new Date('2026-10-18T21:30:00Z'),
      requiredSlots: 6,
      minAge: null,
      tasks: [
        {
          title: 'Abbau-Helfer',
          description: 'Zelt und Stand abbauen',
          requiredSlots: 6,
          minAge: null,
          ageRequirementType: 'ALL' as const,
        },
      ],
    },
  ];

  for (const s of shiftsData) {
    const shift = await prisma.shift.create({
      data: {
        eventId: chilbi.id,
        title: s.title,
        category: s.category,
        description: s.description,
        startTime: s.startTime,
        endTime: s.endTime,
        requiredSlots: s.requiredSlots,
        minAge: s.minAge,
        tasks: {
          create: s.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            requiredSlots: t.requiredSlots,
            minAge: t.minAge,
            ageRequirementType: t.ageRequirementType,
          })),
        },
      },
      include: {
        tasks: true,
      },
    });

    // Beispiel-Einteilungen
    if (s.title.includes('Grillmeister')) {
      const task1 = shift.tasks[0];
      const task2 = shift.tasks[1] || task1;
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, taskId: task1?.id, userId: admin.id },
      });
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, taskId: task2?.id, userId: helperUsers[0].id },
      });
      // Passwortloser Gast-Eintrag
      await prisma.shiftSignup.create({
        data: {
          shiftId: shift.id,
          taskId: task2?.id,
          guestName: 'Gast ohne Konto',
        },
      });
    }

    if (s.title.includes('Bar')) {
      const task1 = shift.tasks[0];
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, taskId: task1?.id, userId: helperUsers[0].id },
      });
    }
  }

  // 6. Demo-Event-Vorlage (Chilbi-Vorlage fürs Folgejahr)
  await prisma.eventTemplate.upsert({
    where: { id: 'demo-chilbi-template' },
    update: {},
    create: {
      id: 'demo-chilbi-template',
      departmentId: department.id,
      title: 'Muster-Vorlage: 3-Tage Chilbi',
      description: 'Standard-Schichten und Arbeiten für einen 3-tägigen Chilbistand (Aufbau, Bar, Grill, Kasse, Abbau).',
      signupMode: 'NAME_ONLY',
      requireEmailForGuests: false,
      requirePhoneForGuests: false,
      data: {
        shifts: shiftsData.map((s) => ({
          title: s.title,
          category: s.category,
          description: s.description,
          startDayOffset: Math.floor((s.startTime.getTime() - chilbi.startDate.getTime()) / (1000 * 60 * 60 * 24)),
          startHour: s.startTime.getUTCHours(),
          startMinute: s.startTime.getUTCMinutes(),
          durationMinutes: Math.round((s.endTime.getTime() - s.startTime.getTime()) / (1000 * 60)),
          minAge: s.minAge,
          tasks: s.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            requiredSlots: t.requiredSlots,
            minAge: t.minAge,
            ageRequirementType: t.ageRequirementType,
          })),
        })),
      },
    },
  });

  console.log('Demo-Schichten, Arbeiten, Einteilungen und Event-Vorlage angelegt.');
}

main()
  .catch((e) => {
    console.error('Fehler beim Seeden:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
