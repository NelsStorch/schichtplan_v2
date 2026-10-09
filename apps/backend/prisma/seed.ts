import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seede Cevi Schichtplan V2 Datenbank...');

  // 1. Abteilung: Cevi Illnau
  const department = await prisma.department.upsert({
    where: { slug: 'illnau' },
    update: {
      name: 'Cevi Illnau-Effretikon',
      logoUrl: '/logos/cevi-illnau.png',
      primaryColor: '#e11d48',
      contactEmail: 'info@cevi-illnau.ch',
    },
    create: {
      name: 'Cevi Illnau-Effretikon',
      slug: 'illnau',
      logoUrl: '/logos/cevi-illnau.png',
      primaryColor: '#e11d48',
      contactEmail: 'info@cevi-illnau.ch',
    },
  });

  console.log(`Abteilung angelegt: ${department.name} (${department.slug})`);

  // 2. Haupt-Admin: "Inferno" (Nels Storch)
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  const adminInferno = await prisma.user.upsert({
    where: { email: 'inferno@cevi-illnau.ch' },
    update: {
      firstName: 'Nels',
      lastName: 'Storch',
      ceviName: 'Inferno',
      birthDate: new Date('1998-05-12'),
      phone: '+41 79 123 45 67',
      isGlobalAdmin: true,
      passwordHash: defaultPasswordHash,
    },
    create: {
      email: 'inferno@cevi-illnau.ch',
      firstName: 'Nels',
      lastName: 'Storch',
      ceviName: 'Inferno',
      birthDate: new Date('1998-05-12'),
      phone: '+41 79 123 45 67',
      isGlobalAdmin: true,
      passwordHash: defaultPasswordHash,
    },
  });

  await prisma.departmentMember.upsert({
    where: {
      departmentId_userId: {
        departmentId: department.id,
        userId: adminInferno.id,
      },
    },
    update: { role: 'ADMIN' },
    create: {
      departmentId: department.id,
      userId: adminInferno.id,
      role: 'ADMIN',
    },
  });

  console.log(
    `Admin-Benutzer angelegt: ${adminInferno.firstName} "${adminInferno.ceviName}" ${adminInferno.lastName}`
  );

  // 3. Weitere Beispiel-Helfer
  const helpersData = [
    {
      email: 'falk@cevi-illnau.ch',
      firstName: 'Lukas',
      lastName: 'Meier',
      ceviName: 'Falk',
      birthDate: new Date('2002-03-21'),
    },
    {
      email: 'polka@cevi-illnau.ch',
      firstName: 'Julia',
      lastName: 'Keller',
      ceviName: 'Polka',
      birthDate: new Date('2004-11-05'),
    },
    {
      email: 'spatz@cevi-illnau.ch',
      firstName: 'Elena',
      lastName: 'Schmid',
      ceviName: 'Spatz',
      birthDate: new Date('2006-08-14'),
    },
  ];

  const helperUsers = [];
  for (const h of helpersData) {
    const user = await prisma.user.upsert({
      where: { email: h.email },
      update: {
        firstName: h.firstName,
        lastName: h.lastName,
        ceviName: h.ceviName,
        birthDate: h.birthDate,
        passwordHash: defaultPasswordHash,
      },
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
      update: { role: 'HELPER' },
      create: {
        departmentId: department.id,
        userId: user.id,
        role: 'HELPER',
      },
    });

    helperUsers.push(user);
  }

  // 4. Events für Cevi Illnau
  // Event A: Chilbi Illnau 2026 (Demonstriert "NAME_ONLY" - Kein Passwort nötig!)
  const chilbi = await prisma.event.upsert({
    where: {
      departmentId_slug: {
        departmentId: department.id,
        slug: 'chilbi-2026',
      },
    },
    update: {
      title: 'Chilbi Illnau 2026',
      description:
        'Der legendäre Cevi-Grill- & Chnoblibrotstand an der Illnauer Chilbi! Hilf mit und unterstütze unsere Abteilung.',
      startDate: new Date('2026-10-16T16:00:00Z'),
      endDate: new Date('2026-10-18T22:00:00Z'),
      isPublished: true,
      allowPublicSignup: true,
      signupMode: 'NAME_ONLY',
    },
    create: {
      departmentId: department.id,
      title: 'Chilbi Illnau 2026',
      slug: 'chilbi-2026',
      description:
        'Der legendäre Cevi-Grill- & Chnoblibrotstand an der Illnauer Chilbi! Hilf mit und unterstütze unsere Abteilung.',
      startDate: new Date('2026-10-16T16:00:00Z'),
      endDate: new Date('2026-10-18T22:00:00Z'),
      isPublished: true,
      allowPublicSignup: true,
      signupMode: 'NAME_ONLY',
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
    update: {
      title: 'Sommerlager 2026 - Abenteuer im Zelt',
      description:
        'Das Sommerlager des Cevi Illnau. Unterstützung gesucht für Vortrupp, Küche und Rücktransport.',
      startDate: new Date('2026-07-11T08:00:00Z'),
      endDate: new Date('2026-07-18T18:00:00Z'),
      isPublished: true,
      allowPublicSignup: true,
      signupMode: 'LOGIN_REQUIRED',
    },
    create: {
      departmentId: department.id,
      title: 'Sommerlager 2026 - Abenteuer im Zelt',
      slug: 'sola-2026',
      description:
        'Das Sommerlager des Cevi Illnau. Unterstützung gesucht für Vortrupp, Küche und Rücktransport.',
      startDate: new Date('2026-07-11T08:00:00Z'),
      endDate: new Date('2026-07-18T18:00:00Z'),
      isPublished: true,
      allowPublicSignup: true,
      signupMode: 'LOGIN_REQUIRED',
    },
  });

  console.log(`Events angelegt: ${chilbi.title}, ${sola.title}`);

  // 5. Schichten für Chilbi Illnau (Bestehende bereinigen vor Neuanlage)
  await prisma.shiftSignup.deleteMany({
    where: { shift: { eventId: chilbi.id } },
  });
  await prisma.shift.deleteMany({
    where: { eventId: chilbi.id },
  });

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

    // Einteilung von "Inferno" und Helfern für realistische Musterdaten
    if (s.title.includes('Grillmeister')) {
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, userId: adminInferno.id },
      });
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, userId: helperUsers[0].id },
      });
      // Auch ein passwortloser Chilbi-Gast eingetragen
      await prisma.shiftSignup.create({
        data: {
          shiftId: shift.id,
          guestName: 'Schnitzel (Ehemaliger)',
          guestPhone: '+41 79 999 88 77',
        },
      });
    }

    if (s.title.includes('Bar')) {
      await prisma.shiftSignup.create({
        data: { shiftId: shift.id, userId: helperUsers[1].id },
      });
    }
  }

  console.log('Schichten und Beispiel-Einteilungen für Cevi Illnau erfolgreich angelegt!');
}

main()
  .catch((e) => {
    console.error('Fehler beim Seeden:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
