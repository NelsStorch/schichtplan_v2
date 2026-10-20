import { describe, expect, it } from 'vitest';
import { deriveCeviDbFields, parseCeviDbGroupId } from './cevidb.js';
import { ceviDbProfileFields, missingProfileFields, personLabel } from './profile.js';

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
});

describe('ceviDbProfileFields', () => {
  it('setzt die Adresse zusammen und bevorzugt die Mobilnummer', () => {
    expect(
      ceviDbProfileFields({
        address: 'Hauptstrasse 1',
        zip_code: '8307',
        town: 'Effretikon',
        phone_numbers: [
          { label: 'Privat', number: '052 000 00 00' },
          { label: 'Mobil', number: '079 000 00 00' },
        ],
      })
    ).toEqual({ address: 'Hauptstrasse 1, 8307 Effretikon', phone: '079 000 00 00' });
    expect(ceviDbProfileFields('x')).toEqual({ address: null, phone: null });
  });
});

describe('Profilangaben', () => {
  const base = { email: null, firstName: 'Max', lastName: 'Muster', phone: null, address: null, birthDate: null };

  it('meldet fehlende Pflichtangaben und ignoriert unbekannte', () => {
    expect(missingProfileFields(base, ['PHONE', 'BIRTH_DATE', 'UNBEKANNT'])).toEqual(['PHONE', 'BIRTH_DATE']);
    expect(missingProfileFields({ ...base, email: 'cevidb_1@cevi-schichtplan.ch' }, ['EMAIL'])).toEqual(['EMAIL']);
  });

  it('zeigt Cevi-Name mit vollem Namen, ohne Wiederholung', () => {
    expect(personLabel({ ceviName: 'Falk', firstName: 'Max', lastName: 'Muster' })).toBe('Falk (Max Muster)');
    expect(personLabel({ ceviName: null, firstName: 'Max', lastName: 'Muster' })).toBe('Max Muster');
  });
});
