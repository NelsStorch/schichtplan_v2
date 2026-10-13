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
    },
    {
      title: 'Grillmeister Freitagabend',
      category: 'Grill & Essensausgabe',
      description: 'Würste, Steaks und Chnoblibrot grillieren. Für Nachschub sorgen.',
      startTime: new Date('2026-10-16T17:00:00Z'),
      endTime: new Date('2026-10-16T21:30:00Z'),
      requiredSlots: 3,
      minAge: null,
    },
    {
      title: 'Bar & Ausschank Freitagabend',
      category: 'Bar & Getränke',
      description: 'Getränke ausgeben, Zapfanlage bedienen und Gläser abwaschen. Mindestalter 18 Jahre.',
      startTime: new Date('2026-10-16T18:00:00Z'),
      endTime: new Date('2026-10-16T23:30:00Z'),
      requiredSlots: 3,
      minAge: 18,
    },
    {
      title: 'Kasse & Bons Samstag Nachmittag',
      category: 'Kasse & Bons',
      description: 'Bons verkaufen, Twint- und Barzahlung abwickeln.',
      startTime: new Date('2026-10-17T13:00:00Z'),
      endTime: new Date('2026-10-17T17:30:00Z'),
      requiredSlots: 2,
      minAge: 16,
    },
    {
      title: 'Grill & Küche Samstagabend',
      category: 'Grill & Essensausgabe',
      description: 'Hochbetrieb am Grill! Zügiges Arbeiten im Team.',
      startTime: new Date('2026-10-17T17:00:00Z'),
      endTime: new Date('2026-10-17T22:00:00Z'),
      requiredSlots: 4,
      minAge: null,
    },
    {
      title: 'Chilbi Abbau & Endreinigung',
      category: 'Abbau & Aufräumen',
      description: 'Alles abbauen, Material im Cevi-Kasten verstauen, Platz sauber wischen.',
      startTime: new Date('2026-10-18T18:00:00Z'),
      endTime: new Date('2026-10-18T21:30:00Z'),
      requiredSlots: 6,
      minAge: null,
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
      },
    });

    // Beispiel-Einteilungen
    if (s.title.includes('Grillmeister')) {
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, userId: admin.id },
      });
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, userId: helperUsers[0].id },
      });
      // Passwortloser Gast-Eintrag
      await prisma.shiftSignup.create({
        data: {
          shiftId: shift.id,
          guestName: 'Gast ohne Konto',
        },
      });
    }

    if (s.title.includes('Bar')) {
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, userId: helperUsers[1].id },
      });
    }
  }

  console.log('Demo-Schichten und Beispiel-Einteilungen angelegt.');
}

main()
  .catch((e) => {
    console.error('Fehler beim Seeden:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
