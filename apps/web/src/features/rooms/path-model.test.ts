import { describe, expect, it } from 'vitest';
import { analyzePath, createRow, initialRows, toSegments } from './path-model';

describe('path-model', () => {
  it('convierte filas en tramos con giro firmado', () => {
    expect(toSegments([createRow(3000, 'left', 90), createRow(2000, 'right', 45)])).toEqual([
      { length: 3000, turn: 90 },
      { length: 2000, turn: -45 },
    ]);
  });

  it('el recorrido inicial es un rectángulo cerrado', () => {
    const analysis = analyzePath(initialRows());
    expect(analysis.status).toBe('closed');
    expect(analysis.valid).toBe(true);
  });

  it('detecta recorridos abiertos (válidos, se cierran solos)', () => {
    const analysis = analyzePath([createRow(4000), createRow(3000), createRow(4000)]);
    expect(analysis.status).toBe('open');
    expect(analysis.valid).toBe(true);
    expect(analysis.traced.closingGap).toBeCloseTo(3000, 6);
  });

  it('rechaza recorridos con pocos lados o que se cruzan', () => {
    expect(analyzePath([createRow(4000, 'left', 180)]).status).toBe('too-few');
    const bowtie = [createRow(4000, 'left', 135), createRow(5657, 'right', 135), createRow(4000)];
    expect(analyzePath(bowtie)).toMatchObject({ status: 'self-intersects', valid: false });
  });

  it('asigna claves únicas a cada fila', () => {
    const keys = initialRows().map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
