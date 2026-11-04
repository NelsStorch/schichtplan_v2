import { describe, expect, it } from 'vitest';
import { shiftDisplayTitle } from './shiftDto.js';

describe('shiftDisplayTitle', () => {
  it('nimmt den Schichttitel, wenn er gesetzt ist', () => {
    expect(shiftDisplayTitle({ title: 'Bar' }, { title: 'Ausschank' })).toBe('Bar');
  });

  it('nimmt ohne Schichttitel die Arbeit', () => {
    expect(shiftDisplayTitle({ title: null }, { title: 'Helfer*in' })).toBe('Helfer*in');
    expect(shiftDisplayTitle({ title: '  ' }, { title: 'Helfer*in' })).toBe('Helfer*in');
  });

  it('fällt ohne beides auf «Schicht» zurück, nie auf «null»', () => {
    expect(shiftDisplayTitle({ title: null })).toBe('Schicht');
    expect(shiftDisplayTitle({ title: null }, { title: null })).toBe('Schicht');
    expect(shiftDisplayTitle({}, null)).toBe('Schicht');
  });
});
