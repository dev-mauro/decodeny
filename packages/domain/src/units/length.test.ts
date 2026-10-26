import { describe, expect, it } from 'vitest';
import {
  formatArea,
  formatLength,
  formatMetersValue,
  metersToMm,
  mmToMeters,
  parseLength,
} from './length';

describe('parseLength', () => {
  it.each([
    ['4', 4000],
    ['4,2', 4200],
    ['4.25', 4250],
    [' 4,25 m ', 4250],
    ['420cm', 4200],
    ['420 cm', 4200],
    ['4200mm', 4200],
    ['0,5', 500],
    [',5', 500],
    ['-1,5', -1500],
    ['3,1416', 3142],
    ['2.', 2000],
  ])('interpreta %s como %i mm', (input, expected) => {
    expect(parseLength(input)).toEqual({ ok: true, value: expected });
  });

  it('rechaza texto vacío', () => {
    expect(parseLength('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it.each(['abc', '4,2,1', '4 2', '4km', 'm', '1e3'])('rechaza %s', (input) => {
    expect(parseLength(input)).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('formato', () => {
  it('formatea en metros con coma decimal', () => {
    expect(formatMetersValue(4200)).toBe('4,20');
    expect(formatLength(4250)).toBe('4,25 m');
    expect(formatLength(12345)).toBe('12,35 m');
  });

  it('formatea áreas en m²', () => {
    expect(formatArea(12_500_000)).toBe('12,50 m²');
  });

  it('convierte entre unidades', () => {
    expect(mmToMeters(1700)).toBe(1.7);
    expect(metersToMm(1.7004)).toBe(1700);
  });
});
