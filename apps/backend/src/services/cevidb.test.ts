import { describe, expect, it } from 'vitest';
import { deriveCeviDbFields, isDepartmentLeaderRole, parseCeviDbGroupId, placeCeviDbPerson } from './cevidb.js';
import { missingProfileFields, personLabel, withoutCeviDbAddress } from './profile.js';

const profile = {
  id: 12211,
  ortsgruppe_id: 161,
  primary_group_id: 900,
  roles: [
    { role_class: 'Group::Jungschar::Abteilungsleiter', group_id: 161, group_name: 'Illnau-Effretikon' },
    { role_class: 'Group::Stufe::Teilnehmer', group_id: 901, group_name: 'Hiskia', role_name: 'Teilnehmer*in' },
    { role_class: 'Group::Stufe::Stufenleiter', group_id: 900, group_name: 'Falken', role_name: 'Stufenleitung' },
    { role_class: 'Group::Stufe::Teilnehmer', group_id: 900, group_name: 'Falken', role_name: 'Teilnehmer*in' },
    { role_class: 'Group::Stufe::Coach', group_id: '902', group_name: 'Adler' },
  ],
};

describe('parseCeviDbGroupId', () => {
  it('nimmt Zahlen und Zahlentext, sonst null', () => {
    expect(parseCeviDbGroupId(161)).toBe(161);
    expect(parseCeviDbGroupId(' 161 ')).toBe(161);
    expect(parseCeviDbGroupId('')).toBeNull();
    expect(parseCeviDbGroupId(-1)).toBeNull();
    expect(parseCeviDbGroupId(2 ** 31)).toBeNull();
    expect(parseCeviDbGroupId('abc')).toBeNull();
  });
});

describe('deriveCeviDbFields', () => {
  it('liest Ortsgruppe, Abteilungsleitung und Stufen', () => {
    const derived = deriveCeviDbFields(profile);
    expect(derived).toMatchObject({
      ortsgruppeId: 161,
      ortsgruppeName: 'Illnau-Effretikon',
      isDepartmentLeader: true,
      leaderGroupName: 'Illnau-Effretikon',
    });
    // Haupt-Stufe zuerst, pro Stufe die stärkste Rolle
    expect(derived.stufen.map((s) => [s.groupName, s.kind, s.isPrimary])).toEqual([
      ['Falken', 'LEITUNG', true],
      ['Hiskia', 'TEILNEHMER', false],
      ['Adler', 'ANDERE', false],
    ]);
    expect(derived.stufen[0].roleNames).toEqual(['Stufenleitung', 'Teilnehmer*in']);
  });

  it('übersteht leere oder kaputte Profile', () => {
    expect(deriveCeviDbFields(null)).toMatchObject({ ortsgruppeId: null, isDepartmentLeader: false, stufen: [] });
    expect(deriveCeviDbFields({ roles: 'kaputt' }).stufen).toEqual([]);
  });

  it('erkennt Abteilungsleiter, Abteilungsleiterin und Abteilungsleitung flexibel', () => {
    expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiter', [])).toBe(true);
    expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiterin', [])).toBe(true);
    expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleitung', [])).toBe(true);
    expect(isDepartmentLeaderRole('Group::Stufe::Stufenleiter', [])).toBe(false);
  });
});

describe('withoutCeviDbAddress', () => {
  it('entfernt Adressfelder, auch in _userInfo', () => {
    expect(
      withoutCeviDbAddress({
        id: 1,
        nickname: 'Falk',
        address: 'Hauptstrasse 1',
        zip_code: '8307',
        town: 'Effretikon',
        country: 'CH',
        _userInfo: { sub: '1', address: 'Hauptstrasse 1', postal_code: '8307' },
      })
    ).toEqual({ id: 1, nickname: 'Falk', _userInfo: { sub: '1' } });
    expect(withoutCeviDbAddress('x')).toBe('x');
  });
});

describe('Profilangaben', () => {
  const base = { email: null, firstName: 'Max', lastName: 'Muster', phone: null, birthDate: null };

  it('meldet fehlende Pflichtangaben und ignoriert unbekannte', () => {
    expect(missingProfileFields(base, ['PHONE', 'BIRTH_DATE', 'UNBEKANNT'])).toEqual(['PHONE', 'BIRTH_DATE']);
    expect(missingProfileFields({ ...base, email: 'cevidb_1@cevi-schichtplan.ch' }, ['EMAIL'])).toEqual(['EMAIL']);
  });

  it('zeigt Cevi-Name mit vollem Namen, ohne Wiederholung', () => {
    expect(personLabel({ ceviName: 'Falk', firstName: 'Max', lastName: 'Muster' })).toBe('Falk (Max Muster)');
    expect(personLabel({ ceviName: null, firstName: 'Max', lastName: 'Muster' })).toBe('Max Muster');
  });
});

describe('placeCeviDbPerson', () => {
  // Rollen wie in den echten Profilen (Oktober 2026)
  const nels = {
    id: 12211,
    ortsgruppe_id: 161,
    primary_group_id: 805,
    roles: [
      { role_class: 'Group::MitgliederorganisationGremium::Mitglied', group_id: 4262, group_name: 'Refine - Seilbahn' },
      { role_class: 'Group::Ortsgruppe::AdministratorCeviDB', group_id: 161, group_name: 'Illnau-Effretikon' },
      { role_class: 'Group::Jungschar::Abteilungsleiter', group_id: 295, group_name: 'JS Illnau' },
      { role_class: 'Group::Jungschar::FreierMitarbeiter', group_id: 726, group_name: 'JS Effretikon' },
      { role_class: 'Group::Stufe::Stufenleiter', group_id: 805, group_name: 'Hiskia' },
    ],
  };
  const leiterinIllnau = {
    id: 16206,
    ortsgruppe_id: 161,
    primary_group_id: 806,
    roles: [{ role_class: 'Group::Stufe::Gruppenleiter', group_id: 806, group_name: 'Joschija' }],
  };
  const weiningen = {
    id: 8050,
    ortsgruppe_id: 219,
    primary_group_id: 817,
    roles: [
      { role_class: 'Group::Verein::Mitglied', group_id: 250, group_name: 'Verein Weiningen-Geroldswil' },
      { role_class: 'Group::Froeschli::Froeschlileiter', group_id: 782, group_name: 'Fröschli Weiningen-Geroldswil' },
      { role_class: 'Group::Stufe::Gruppenleiter', group_id: 817, group_name: 'Stufe Sirius' },
    ],
  };
  const leitungEffretikon = {
    id: 1,
    ortsgruppe_id: 161,
    primary_group_id: 726,
    roles: [{ role_class: 'Group::Jungschar::Abteilungsleiter', group_id: 726, group_name: 'JS Effretikon' }],
  };

  const group = (id: number, jungscharId: number | null, ortsgruppeId: number | null, jungscharCount: number | null = null) =>
    [id, { id, name: `Gruppe ${id}`, jungscharId, ortsgruppeId, jungscharCount }] as const;
  const groups = new Map([
    group(161, null, 161, 2),
    group(295, 295, 161),
    group(726, 726, 161),
    group(805, 295, 161),
    group(806, 295, 161),
    group(4262, null, null),
    group(219, null, 219, 1),
    group(250, null, 219),
    group(782, 800, 219),
    group(817, 800, 219),
    group(800, 800, 219),
  ]);
  const departments = new Map([
    [295, 'illnau'],
    [726, 'effretikon'],
    [219, 'weiningen'],
  ]);
  const place = (profile: unknown, known = groups, current: string | null = null, depts = departments) =>
    placeCeviDbPerson(deriveCeviDbFields(profile), known, depts, current);

  it('deine Rollen: Heimabteilung über die Hauptgruppe, Leitung nur in der eigenen Jungschar', () => {
    expect(place(nels)).toMatchObject({
      verified: true,
      homeDepartmentId: 'illnau',
      departmentIds: ['illnau', 'effretikon'],
      leaderDepartmentIds: ['illnau'],
      ortsgruppeId: 161,
      jungscharIds: [295, 726],
    });
  });

  it('ordnet eine normale Leiterin über ihre Stufe zu', () => {
    expect(place(leiterinIllnau)).toMatchObject({ homeDepartmentId: 'illnau', leaderDepartmentIds: [], jungscharIds: [295] });
  });

  it('ändert nichts für eine Abteilung auf Ebene der Ortsgruppe', () => {
    expect(place(weiningen)).toMatchObject({
      homeDepartmentId: 'weiningen',
      departmentIds: ['weiningen'],
      leaderDepartmentIds: [],
      ortsgruppeId: 219,
    });
    const leitung = { ...weiningen, roles: [{ role_class: 'Group::Jungschar::Abteilungsleiter', group_id: 800 }] };
    expect(place(leitung)).toMatchObject({ homeDepartmentId: 'weiningen', leaderDepartmentIds: ['weiningen'] });
  });

  it('die Effretikoner Leitung wird nie Abteilungsleitung von Illnau', () => {
    expect(place(leitungEffretikon)).toMatchObject({ homeDepartmentId: 'effretikon', leaderDepartmentIds: ['effretikon'] });
  });

  it('eine geänderte ortsgruppe_id bringt weder Abteilung noch Leitung', () => {
    expect(place({ ...leitungEffretikon, ortsgruppe_id: 219 })).toMatchObject({
      homeDepartmentId: 'effretikon',
      departmentIds: ['effretikon'],
      leaderDepartmentIds: ['effretikon'],
      ortsgruppeId: 161,
    });
  });

  it('prüft ohne Gruppenstruktur nichts: keine Leitung, nur die Angabe der Person', () => {
    expect(place(leitungEffretikon, new Map())).toMatchObject({
      verified: false,
      homeDepartmentId: null,
      leaderDepartmentIds: null,
      selfDeclaredDepartmentId: null,
    });
    expect(place({ ...leitungEffretikon, ortsgruppe_id: 219 }, new Map())).toMatchObject({
      verified: false,
      leaderDepartmentIds: null,
      selfDeclaredDepartmentId: 'weiningen',
    });
  });

  it('entzieht ohne Leitungsrolle auch ohne Gruppenstruktur die Leitung', () => {
    expect(place(leiterinIllnau, new Map()).leaderDepartmentIds).toEqual([]);
  });

  it('hängt die Abteilung noch an der geteilten Ortsgruppe, bleibt die Leitung ungeprüft', () => {
    const shared = new Map([[161, 'gemeinsam']]);
    expect(place(leitungEffretikon, groups, null, shared)).toMatchObject({
      homeDepartmentId: 'gemeinsam',
      leaderDepartmentIds: null,
    });
  });

  it('wählt bei mehreren Abteilungen ohne Hauptgruppe nicht selbst', () => {
    const zwei = {
      id: 2,
      primary_group_id: 4262,
      roles: [
        { role_class: 'Group::Stufe::Helfer', group_id: 806 },
        { role_class: 'Group::Stufe::Helfer', group_id: 817 },
      ],
    };
    expect(place(zwei).homeDepartmentId).toBeNull();
    expect(place(zwei, groups, 'weiningen').homeDepartmentId).toBe('weiningen');
    expect(place({ ...zwei, ortsgruppe_id: 219 }).homeDepartmentId).toBe('weiningen');
  });

  it('gilt als unvollständig, wenn eine Gruppe fehlt', () => {
    const ohneStufe = new Map(groups);
    ohneStufe.delete(805);
    expect(place(nels, ohneStufe)).toMatchObject({ complete: false, verified: true, leaderDepartmentIds: ['illnau'] });
  });
});
