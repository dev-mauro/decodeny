import { describe, expect, it } from 'vitest';
import { normalizeDegrees, radToDeg } from '../units/angle';
import { Registry } from './registry';

describe('Registry', () => {
  it('registra, consulta y lista entradas', () => {
    const registry = new Registry<{ id: string; label: string }>('test');
    registry.register({ id: 'a', label: 'A' }, { id: 'b', label: 'B' });
    expect(registry.size).toBe(2);
    expect(registry.has('a')).toBe(true);
    expect(registry.get('b')?.label).toBe('B');
    expect(registry.get('zz')).toBeUndefined();
    expect(registry.require('a').label).toBe('A');
    expect(registry.list().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('rechaza ids duplicados y entradas inexistentes', () => {
    const registry = new Registry<{ id: string }>('test').register({ id: 'a' });
    expect(() => registry.register({ id: 'a' })).toThrow(/ya está registrado/);
    expect(() => registry.require('x')).toThrow(/no está registrado/);
  });
});

describe('ángulos', () => {
  it('normaliza grados y convierte radianes', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(450)).toBe(90);
    expect(radToDeg(Math.PI)).toBe(180);
  });
});
