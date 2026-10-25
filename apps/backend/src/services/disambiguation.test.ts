import { describe, it, expect } from 'vitest';
import {
  disambiguatePersonNames,
  extractPrimaryStufe,
  formatDepartmentShort,
  type DisambiguationCandidate,
} from './disambiguation.js';

describe('disambiguation', () => {
  describe('formatDepartmentShort', () => {
    it('strips "Cevi " prefix for compact parentheses', () => {
      expect(formatDepartmentShort('Cevi Illnau-Effretikon')).toBe('Illnau-Effretikon');
      expect(formatDepartmentShort('Cevi Wetzikon')).toBe('Wetzikon');
      expect(formatDepartmentShort('Uster')).toBe('Uster');
      expect(formatDepartmentShort(null)).toBeNull();
    });
  });

  describe('extractPrimaryStufe', () => {
    it('prefers primary Cevi.DB stufe', () => {
      const user = {
        ceviDbStufen: [
          { groupName: 'Fröschli', isPrimary: false },
          { groupName: 'Hiskia', isPrimary: true },
        ],
        stufen: [{ stufe: { name: 'AndereStufe' } }],
      };
      expect(extractPrimaryStufe(user)).toBe('Hiskia');
    });

    it('falls back to local stufen if no Cevi.DB stufe', () => {
      const user = {
        ceviDbStufen: [],
        stufen: [{ stufe: { name: 'Puma' } }],
      };
      expect(extractPrimaryStufe(user)).toBe('Puma');
    });

    it('returns null when no stufe present', () => {
      expect(extractPrimaryStufe({ ceviDbStufen: [], stufen: [] })).toBeNull();
      expect(extractPrimaryStufe(null)).toBeNull();
    });
  });

  describe('disambiguatePersonNames cascade', () => {
    it('leaves single Cevi-Name untouched (no collision)', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: 'Falk', firstName: 'Max', stufe: 'Hiskia' },
        { personKey: 'u2', ceviName: 'Inferno', firstName: 'Nels', stufe: 'Leitung' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Falk');
      expect(names.get('u2')).toBe('Inferno');
    });

    it('cascade step 1: disambiguates by Stufe when stufen are unique', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: 'Falk', firstName: 'Max', stufe: 'Hiskia', departmentName: 'Cevi Illnau' },
        { personKey: 'u2', ceviName: 'Falk', firstName: 'Robin', stufe: 'Fröschli', departmentName: 'Cevi Illnau' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Falk (Hiskia)');
      expect(names.get('u2')).toBe('Falk (Fröschli)');
    });

    it('cascade step 2a: disambiguates by Abteilung when stufe is empty', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: 'Falk', firstName: 'Max', stufe: null, departmentName: 'Cevi Illnau' },
        { personKey: 'u2', ceviName: 'Falk', firstName: 'Tim', stufe: null, departmentName: 'Cevi Wetzikon' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Falk (Illnau)');
      expect(names.get('u2')).toBe('Falk (Wetzikon)');
    });

    it('cascade step 2b: shows both (Stufe, Abteilung) when stufen are equal across departments', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: 'Falk', firstName: 'Max', stufe: 'Hiskia', departmentName: 'Cevi Illnau' },
        { personKey: 'u2', ceviName: 'Falk', firstName: 'Robin', stufe: 'Hiskia', departmentName: 'Cevi Wetzikon' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Falk (Hiskia, Illnau)');
      expect(names.get('u2')).toBe('Falk (Hiskia, Wetzikon)');
    });

    it('cascade step 3: uses Vorname v/o Cevi-Name when stufe and department are identical or missing', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: 'Falk', firstName: 'Max', lastName: 'Muster', stufe: 'Hiskia', departmentName: 'Cevi Illnau' },
        { personKey: 'u2', ceviName: 'Falk', firstName: 'Robin', lastName: 'Keller', stufe: 'Hiskia', departmentName: 'Cevi Illnau' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Max v/o Falk');
      expect(names.get('u2')).toBe('Robin v/o Falk');
    });

    it('cascade step 4: uses Vorname Nachname v/o Cevi-Name when first names are also identical', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: 'Falk', firstName: 'Max', lastName: 'Muster', stufe: null, departmentName: 'Cevi Illnau' },
        { personKey: 'u2', ceviName: 'Falk', firstName: 'Max', lastName: 'Meier', stufe: null, departmentName: 'Cevi Illnau' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Max Muster v/o Falk');
      expect(names.get('u2')).toBe('Max Meier v/o Falk');
    });

    it('handles persons without Cevi-Name properly', () => {
      const candidates: DisambiguationCandidate[] = [
        { personKey: 'u1', ceviName: null, firstName: 'Anna', lastName: 'Muster' },
        { personKey: 'g1', ceviName: null, guestName: 'Spontaner Helfer' },
      ];
      const names = disambiguatePersonNames(candidates);
      expect(names.get('u1')).toBe('Anna Muster');
      expect(names.get('g1')).toBe('Spontaner Helfer');
    });
  });
});
