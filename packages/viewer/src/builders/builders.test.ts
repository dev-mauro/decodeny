import { computeWallFootprints, vec2, type Vec2 } from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import type { MeshData } from './mesh-data';
import { buildSurfaceMesh } from './surface-mesh';
import { buildWallMesh } from './wall-mesh';

type V3 = [number, number, number];

const vertex = (data: MeshData, i: number): V3 => [
  data.positions[i * 3]!,
  data.positions[i * 3 + 1]!,
  data.positions[i * 3 + 2]!,
];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Recorre los triángulos de un slot devolviendo su normal geométrica y área. */
function triangles(data: MeshData, slot: string) {
  const group = data.groups.find((g) => g.slot === slot);
  if (!group) return [];
  const out: { normal: V3; declared: V3; area: number }[] = [];
  for (let t = group.start; t < group.start + group.count; t += 3) {
    const [a, b, c] = [data.indices[t]!, data.indices[t + 1]!, data.indices[t + 2]!];
    const n = cross(sub(vertex(data, b), vertex(data, a)), sub(vertex(data, c), vertex(data, a)));
    const declared: V3 = [data.normals[a * 3]!, data.normals[a * 3 + 1]!, data.normals[a * 3 + 2]!];
    out.push({ normal: n, declared, area: Math.hypot(...n) / 2 });
  }
  return out;
}

const totalArea = (data: MeshData, slot: string) =>
  triangles(data, slot).reduce((s, t) => s + t.area, 0);

function expectConsistentWinding(data: MeshData) {
  for (const group of data.groups) {
    for (const tri of triangles(data, group.slot)) {
      expect(dot(tri.normal, tri.declared)).toBeGreaterThan(0);
    }
  }
}

describe('buildWallMesh', () => {
  const single = computeWallFootprints(
    new Map([
      ['a', vec2(0, 0)],
      ['b', vec2(4000, 0)],
    ]),
    [{ id: 'w', start: 'a', end: 'b', thickness: 200 }],
  ).get('w')!;

  it('genera caras laterales, superior y tapas con áreas correctas', () => {
    const mesh = buildWallMesh(single, 2400);
    expect(mesh.groups.map((g) => g.slot)).toEqual(['left', 'right', 'top', 'cap']);
    expect(buildWallMesh(single, 2400, []).groups).toEqual(mesh.groups);
    expect(totalArea(mesh, 'left')).toBeCloseTo(4 * 2.4, 6);
    expect(totalArea(mesh, 'right')).toBeCloseTo(4 * 2.4, 6);
    expect(totalArea(mesh, 'top')).toBeCloseTo(4 * 0.2, 6);
    expect(totalArea(mesh, 'cap')).toBeCloseTo(2 * 0.2 * 2.4, 6);
    expectConsistentWinding(mesh);
  });

  it('orienta la cara izquierda hacia la izquierda del muro (norte = −Z)', () => {
    const mesh = buildWallMesh(single, 2400);
    const [left] = triangles(mesh, 'left');
    expect(left!.declared).toEqual([0, 0, -1]);
    const [top] = triangles(mesh, 'top');
    expect(top!.declared).toEqual([0, 1, 0]);
  });

  it('no tapa extremos unidos y mantiene el winding en esquinas', () => {
    const pts: Vec2[] = [vec2(0, 0), vec2(4000, 0), vec2(4000, 3000), vec2(0, 3000)];
    const fps = computeWallFootprints(
      new Map(pts.map((p, i) => [`n${i}`, p])),
      [0, 1, 2, 3].map((i) => ({
        id: `w${i}`,
        start: `n${i}`,
        end: `n${(i + 1) % 4}`,
        thickness: 150,
      })),
    );
    for (const fp of fps.values()) {
      const mesh = buildWallMesh(fp, 2500);
      expect(mesh.groups.some((g) => g.slot === 'cap')).toBe(false);
      expectConsistentWinding(mesh);
    }
    // Cara interior del muro inferior: 4,00 − 0,15 m de largo.
    expect(totalArea(buildWallMesh(fps.get('w0')!, 2500), 'left')).toBeCloseTo(3.85 * 2.5, 6);
  });
});

describe('buildWallMesh con vanos', () => {
  const single = computeWallFootprints(
    new Map([
      ['a', vec2(0, 0)],
      ['b', vec2(4000, 0)],
    ]),
    [{ id: 'w', start: 'a', end: 'b', thickness: 200 }],
  ).get('w')!;

  it('una ventana es un agujero en ambas caras con jambas, dintel y peana', () => {
    const mesh = buildWallMesh(single, 2400, [
      { offset: 1500, width: 1200, height: 1100, sill: 900 },
    ]);
    const solid = 4 * 2.4 - 1.2 * 1.1;
    expect(totalArea(mesh, 'left')).toBeCloseTo(solid, 6);
    expect(totalArea(mesh, 'right')).toBeCloseTo(solid, 6);
    expect(totalArea(mesh, 'reveal')).toBeCloseTo(2 * 1.1 * 0.2 + 2 * 1.2 * 0.2, 6);
    expect(mesh.groups.some((g) => g.slot === 'threshold')).toBe(false);
    expectConsistentWinding(mesh);
    // Las jambas miran hacia el interior del vano.
    const normals = triangles(mesh, 'reveal').map((t) => t.declared.join(','));
    expect(normals).toContain('1,0,0');
    expect(normals).toContain('-1,0,0');
    expect(normals).toContain('0,-1,0');
    expect(normals).toContain('0,1,0');
  });

  it('una puerta recorta el borde inferior y agrega umbral', () => {
    const mesh = buildWallMesh(single, 2400, [
      { offset: 1000, width: 800, height: 2000, sill: 0 },
      { offset: 3000, width: 900, height: 1000, sill: 1000 },
    ]);
    expect(totalArea(mesh, 'left')).toBeCloseTo(4 * 2.4 - 0.8 * 2 - 0.9 * 1, 6);
    expect(totalArea(mesh, 'threshold')).toBeCloseTo(0.8 * 0.2, 6);
    // Puerta: 2 jambas + dintel. Ventana: 2 jambas + dintel + peana.
    expect(totalArea(mesh, 'reveal')).toBeCloseTo(
      2 * 2 * 0.2 + 0.8 * 0.2 + 2 * 1 * 0.2 + 2 * 0.9 * 0.2,
      6,
    );
    expectConsistentWinding(mesh);
  });
});

describe('buildSurfaceMesh', () => {
  const lShape = [
    vec2(0, 0),
    vec2(6000, 0),
    vec2(6000, 2000),
    vec2(3000, 2000),
    vec2(3000, 4000),
    vec2(0, 4000),
  ];

  it('triangula pisos poligonales mirando hacia arriba', () => {
    const mesh = buildSurfaceMesh(lShape, 0, 'up');
    expect(totalArea(mesh, 'surface')).toBeCloseTo(18, 6);
    expect(triangles(mesh, 'surface')[0]!.declared).toEqual([0, 1, 0]);
    expectConsistentWinding(mesh);
  });

  it('genera cielos mirando hacia abajo a la altura indicada', () => {
    const mesh = buildSurfaceMesh(lShape, 2400, 'down');
    expect(triangles(mesh, 'surface')[0]!.declared).toEqual([0, -1, 0]);
    expect(mesh.positions[1]).toBeCloseTo(2.4, 6);
    // El norte de la planta es −Z.
    expect(Math.min(...Array.from(mesh.positions).filter((_, i) => i % 3 === 2))).toBeCloseTo(
      -4,
      6,
    );
    expectConsistentWinding(mesh);
  });

  it('ignora polígonos degenerados', () => {
    const mesh = buildSurfaceMesh([vec2(0, 0), vec2(1, 0)], 0, 'up');
    expect(mesh.indices).toHaveLength(0);
    expect(mesh.groups).toHaveLength(0);
  });
});
