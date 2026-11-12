import { describe, expect, it, vi } from 'vitest';
import { buildPlanDocument, type PrintPlanOptions } from './printPlan';
import type { EventDetails } from './types';
import type { DepartmentDto } from '@schichtplan/shared';

function createMockEvent(): EventDetails {
  return {
    id: 'ev-1',
    title: 'Sommerfest 2026',
    slug: 'sommerfest-2026',
    description: 'Grosses Sommerfest für die ganze Abteilung',
    startDate: '2026-06-20T08:00:00Z',
    endDate: '2026-06-21T18:00:00Z',
    dayCutoffTime: '04:00',
    logoUrl: 'https://example.ch/logo.png',
    audience: 'Alle',
    allowPublicSignup: true,
    accessType: 'PUBLIC',
    leadersOnly: false,
    requiredFields: [],
    allowedDepartments: [],
    allowedStufen: [],
    questions: [],
    viewer: {
      isLoggedIn: false,
      isGlobalAdmin: false,
      isDeptLeader: false,
      canEditShifts: false,
      canViewShiftSignupDetails: false,
    },
    dayResponsibles: {
      '2026-06-20': [{ id: 'resp-1', displayName: 'Robin / Leiter' }],
    },
    shifts: [
      {
        id: 'shift-bar',
        eventId: 'ev-1',
        title: 'Bar & Ausschank',
        category: 'Gastronomie',
        description: 'Getränke ausgeben und Kasse bedienen',
        startTime: '2026-06-20T16:00:00Z', // 18:00 MESZ
        endTime: '2026-06-20T20:00:00Z',   // 22:00 MESZ
        requiredSlots: 2,
        isSetupTeardown: false,
        minAge: 18,
        responsibles: [{ id: 'resp-2', displayName: 'Samira' }],
        tasks: [
          {
            id: 'task-bar-kasse',
            shiftId: 'shift-bar',
            title: 'Kasse',
            requiredSlots: 1,
            signups: [
              {
                id: 'su-1',
                shiftId: 'shift-bar',
                taskId: 'task-bar-kasse',
                userId: 'user-anna',
                displayName: 'Anna Meier',
                guestName: null,
                createdAt: '2026-06-01T10:00:00Z',
              },
            ],
          },
          {
            id: 'task-bar-zapfen',
            shiftId: 'shift-bar',
            title: 'Zapfhahn',
            requiredSlots: 1,
            signups: [], // offen
          },
        ],
        signups: [
          {
            id: 'su-1',
            shiftId: 'shift-bar',
            taskId: 'task-bar-kasse',
            userId: 'user-anna',
            displayName: 'Anna Meier',
            guestName: null,
            createdAt: '2026-06-01T10:00:00Z',
          },
        ],
      },
      {
        id: 'shift-aufbau',
        eventId: 'ev-1',
        title: 'Aufbau Festzelt',
        category: 'Infrastruktur',
        description: 'Zelt aufstellen und Tische stellen',
        startTime: '2026-06-20T07:00:00Z', // 09:00 MESZ
        endTime: '2026-06-20T11:00:00Z',   // 13:00 MESZ
        requiredSlots: 2,
        isSetupTeardown: true,
        tasks: [
          {
            id: 'task-aufbau-1',
            shiftId: 'shift-aufbau',
            title: 'Aufbau Festzelt',
            requiredSlots: 2,
            signups: [
              {
                id: 'su-2',
                shiftId: 'shift-aufbau',
                taskId: 'task-aufbau-1',
                userId: 'user-anna',
                displayName: 'Anna Meier',
                guestName: null,
                createdAt: '2026-06-01T11:00:00Z',
              },
              {
                id: 'su-3',
                shiftId: 'shift-aufbau',
                taskId: 'task-aufbau-1',
                userId: null,
                displayName: 'Gast Beat',
                guestName: 'Gast Beat',
                createdAt: '2026-06-02T12:00:00Z',
              },
            ],
          },
        ],
        signups: [
          {
            id: 'su-2',
            shiftId: 'shift-aufbau',
            taskId: 'task-aufbau-1',
            userId: 'user-anna',
            displayName: 'Anna Meier',
            guestName: null,
            createdAt: '2026-06-01T11:00:00Z',
          },
          {
            id: 'su-3',
            shiftId: 'shift-aufbau',
            taskId: 'task-aufbau-1',
            userId: null,
            displayName: 'Gast Beat',
            guestName: 'Gast Beat',
            createdAt: '2026-06-02T12:00:00Z',
          },
        ],
      },
    ],
  } as unknown as EventDetails;
}

function createMockDepartment(): DepartmentDto {
  return {
    id: 'dept-1',
    name: 'Cevi Wetzikon',
    slug: 'wetzikon',
    organization: 'CEVI',
    primaryColor: '#0284c7',
    logoUrl: 'https://example.ch/dept-logo.png',
  } as unknown as DepartmentDto;
}

describe('buildPlanDocument', () => {
  const defaultOptions: PrintPlanOptions = {
    layout: 'plan',
    days: ['2026-06-20'],
    landscape: true,
    pageBreakPerDay: false,
    showDetails: true,
    onlyOpen: false,
  };

  const mockImageLoader = vi.fn().mockResolvedValue('data:image/png;base64,mocked');

  it('erstellt Plan-Dokument mit korrekten Metadaten und Tagesstruktur', async () => {
    const event = createMockEvent();
    const dept = createMockDepartment();

    const doc = await buildPlanDocument(event, dept, defaultOptions, mockImageLoader);

    expect(doc.title).toBe('Sommerfest 2026');
    expect(doc.layout).toBe('plan');
    expect(doc.landscape).toBe(true);
    expect(doc.days).toHaveLength(1);

    const day = doc.days[0];
    expect(day.key).toBe('2026-06-20');
    expect(day.responsibles).toBe('Robin / Leiter');
    expect(day.shiftCount).toBe(2);
    // Gesamtplätze: Bar (2) + Aufbau (2) = 4, Besetzt: Bar (1) + Aufbau (2) = 3
    expect(day.required).toBe(4);
    expect(day.filled).toBe(3);
    expect(day.shifts).toHaveLength(2);
  });

  it('enthält Detailinformationen wie Kategorie, Beschreibung und Tags bei showDetails: true', async () => {
    const event = createMockEvent();
    const doc = await buildPlanDocument(event, null, { ...defaultOptions, showDetails: true }, mockImageLoader);

    const barShift = doc.days[0].shifts.find((s) => s.id === 'shift-bar');
    expect(barShift?.category).toBe('Gastronomie');
    expect(barShift?.description).toBe('Getränke ausgeben und Kasse bedienen');
    expect(barShift?.tags).toContain('ab 18');
    expect(barShift?.tags).toContain('Verantwortlich: Samira');

    const aufbauShift = doc.days[0].shifts.find((s) => s.id === 'shift-aufbau');
    expect(aufbauShift?.tags).toContain('Auf-/Abbau');
  });

  it('blendet Detailinformationen bei showDetails: false aus', async () => {
    const event = createMockEvent();
    const doc = await buildPlanDocument(event, null, { ...defaultOptions, showDetails: false }, mockImageLoader);

    const barShift = doc.days[0].shifts.find((s) => s.id === 'shift-bar');
    expect(barShift?.category).toBeNull();
    expect(barShift?.description).toBeNull();
    expect(barShift?.tags).toEqual([]);
  });

  it('filtert bei onlyOpen: true voll besetzte Schichten heraus', async () => {
    const event = createMockEvent();
    // Bar hat 1 offenen Platz (Zapfhahn), Aufbau ist komplett voll (2 von 2)
    const doc = await buildPlanDocument(event, null, { ...defaultOptions, onlyOpen: true }, mockImageLoader);

    expect(doc.days[0].shifts).toHaveLength(1);
    expect(doc.days[0].shifts[0].id).toBe('shift-bar');
    // Nur der offene Task bleibt
    expect(doc.days[0].shifts[0].tasks).toHaveLength(1);
    expect(doc.days[0].shifts[0].tasks[0].title).toBe('Zapfhahn');
  });

  it('erstellt im Personen-Layout eine alphabetische Helferliste', async () => {
    const event = createMockEvent();
    const doc = await buildPlanDocument(event, null, { ...defaultOptions, layout: 'personen' }, mockImageLoader);

    expect(doc.people.length).toBe(2);
    // Sortiert: Anna Meier vor Gast Beat
    expect(doc.people[0].name).toBe('Anna Meier');
    expect(doc.people[0].items.length).toBe(2); // Kasse und Aufbau
    expect(doc.people[1].name).toBe('Gast Beat');
    expect(doc.people[1].items.length).toBe(1); // Aufbau
  });

  it('lädt Logos über den übergebenen ImageLoader', async () => {
    const event = createMockEvent();
    const dept = createMockDepartment();
    mockImageLoader.mockClear();

    const doc = await buildPlanDocument(event, dept, defaultOptions, mockImageLoader);

    expect(mockImageLoader).toHaveBeenCalled();
    expect(doc.logo).toBe('data:image/png;base64,mocked');
  });
});
