import { describe, expect, it } from 'vitest';
import type { ItemEnvelope } from '../catalog/item-definition';
import {
  addItem,
  deleteItems,
  duplicateItems,
  moveItems,
  pasteItems,
  rotateItems,
  updateItem,
} from '../commands/items';
import { deleteRoom, moveRoom } from '../commands/rooms';
import { DomainError } from '../errors';
import { benchWithRoom, type TestBench } from '../test-utils/fixtures';
import { checkIntegrity } from './integrity';
import {
  ceilingHeightAt,
  itemFootprint,
  itemFront,
  itemWarnings,
  normalizeRotation,
  roomOfItem,
  rotationFacing,
  snapItemPlacement,
} from './items';
import { requireLevel } from './queries';

const BED: ItemEnvelope = { width: 1400, depth: 2000, height: 600 };
const envelopeOf = () => BED;
const level = (bench: TestBench) => requireLevel(bench.project, bench.levelId);

function place(bench: TestBench, x: number, y: number, rotation = 0) {
  return bench.run(addItem, {
    levelId: bench.levelId,
    def: 'furniture.bed@1',
    params: { width: BED.width, depth: BED.depth, height: BED.height },
    position: { x, y },
    rotation,
  }).itemId;
}

describe('geometría de items', () => {
  it('normaliza rotaciones', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(359.999)).toBe(0);
  });

  it('el frente mira al sur con rotación 0 y gira antihorario', () => {
    expect(itemFront(0).x).toBeCloseTo(0, 9);
    expect(itemFront(0).y).toBeCloseTo(-1, 9);
    expect(itemFront(90).x).toBeCloseTo(1, 9);
    expect(rotationFacing({ x: 0, y: 1 })).toBe(180);
    expect(rotationFacing({ x: -1, y: 0 })).toBe(270);
  });

  it('la huella respeta ancho, profundidad y rotación', () => {
    const fp = itemFootprint({ position: { x: 0, y: 0, z: 0 }, rotation: 90 }, BED);
    const xs = fp.map((p) => Math.round(p.x));
    const ys = fp.map((p) => Math.round(p.y));
    expect(Math.max(...xs) - Math.min(...xs)).toBe(2000);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(1400);
  });
});

describe('comandos de items', () => {
  it('agrega, actualiza, duplica, pega y elimina', () => {
    const bench = benchWithRoom();
    const id = place(bench, 2000, 1500);
    bench.run(updateItem, {
      levelId: bench.levelId,
      itemId: id,
      position: { x: 1000.4 },
      rotation: -90,
      params: { width: 900 },
    });
    expect(level(bench).items[0]).toMatchObject({
      position: { x: 1000, y: 1500, z: 0 },
      rotation: 270,
      params: { width: 900, depth: 2000 },
    });
    const { itemIds } = bench.run(duplicateItems, {
      levelId: bench.levelId,
      itemIds: [id],
      offset: { x: 100, y: 0 },
    });
    expect(level(bench).items[1]).toMatchObject({ id: itemIds[0], position: { x: 1100 } });
    bench.run(pasteItems, {
      levelId: bench.levelId,
      items: [level(bench).items[0]!],
      offset: { x: 0, y: 500 },
    });
    expect(level(bench).items).toHaveLength(3);
    expect(new Set(level(bench).items.map((i) => i.id)).size).toBe(3);
    bench.run(deleteItems, { levelId: bench.levelId, itemIds: [id, itemIds[0]!] });
    expect(level(bench).items).toHaveLength(1);
    expect(checkIntegrity(bench.project)).toEqual([]);
  });

  it('acepta un id propio libre (vista previa al ubicar) y rechaza uno en uso', () => {
    const bench = benchWithRoom();
    const args = {
      levelId: bench.levelId,
      def: 'furniture.bed@1',
      params: { width: BED.width, depth: BED.depth, height: BED.height },
      position: { x: 1000, y: 1000 },
      id: 'item_placing',
    };
    expect(bench.run(addItem, args).itemId).toBe('item_placing');
    expect(() => bench.run(addItem, args)).toThrow(DomainError);
    expect(() => bench.run(addItem, { ...args, id: '' })).toThrow(DomainError);
  });

  it('mueve y gira un grupo conservando su disposición', () => {
    const bench = benchWithRoom();
    const a = place(bench, 1000, 1000);
    const b = place(bench, 3000, 1000, 90);
    bench.run(moveItems, { levelId: bench.levelId, itemIds: [a, b], delta: { x: 100, y: -50 } });
    const at = (id: string) => level(bench).items.find((i) => i.id === id)!;
    expect(at(a).position).toMatchObject({ x: 1100, y: 950 });
    expect(at(b).position).toMatchObject({ x: 3100, y: 950 });
    // Giro de 90° alrededor del centro (2100, 950): a pasa abajo, b arriba.
    bench.run(rotateItems, { levelId: bench.levelId, itemIds: [a, b], degrees: 90 });
    expect(at(a).position).toMatchObject({ x: 2100, y: -50 });
    expect(at(b).position).toMatchObject({ x: 2100, y: 1950 });
    expect(at(a).rotation).toBe(90);
    expect(at(b).rotation).toBe(180);
    // Un solo item gira en su lugar.
    bench.run(rotateItems, { levelId: bench.levelId, itemIds: [a], degrees: -90 });
    expect(at(a).position).toMatchObject({ x: 2100, y: -50 });
    expect(at(a).rotation).toBe(0);
    expect(() =>
      bench.run(moveItems, { levelId: bench.levelId, itemIds: ['x'], delta: { x: 1, y: 1 } }),
    ).toThrow(DomainError);
  });

  it('valida referencias y números', () => {
    const bench = benchWithRoom();
    expect(() =>
      bench.run(addItem, {
        levelId: bench.levelId,
        def: 'cama',
        params: {},
        position: { x: 0, y: 0 },
      }),
    ).toThrow(DomainError);
    const id = place(bench, 0, 0);
    expect(() =>
      bench.run(updateItem, { levelId: bench.levelId, itemId: id, rotation: Number.NaN }),
    ).toThrow(DomainError);
    expect(() => bench.run(deleteItems, { levelId: bench.levelId, itemIds: ['x'] })).toThrow(
      DomainError,
    );
  });

  it('los muebles se mueven y se eliminan con su recinto', () => {
    const bench = benchWithRoom();
    const inside = place(bench, 2000, 1500);
    const outside = place(bench, 9000, 1500);
    bench.run(moveRoom, { levelId: bench.levelId, roomId: bench.roomId, dx: 500, dy: 0 });
    const moved = level(bench).items.find((i) => i.id === inside)!;
    expect(moved.position.x).toBe(2500);
    expect(level(bench).items.find((i) => i.id === outside)!.position.x).toBe(9000);
    expect(roomOfItem(level(bench), moved)?.id).toBe(bench.roomId);
    bench.run(deleteRoom, { levelId: bench.levelId, roomId: bench.roomId });
    expect(level(bench).items.map((i) => i.id)).toEqual([outside]);
  });
});

describe('avisos de ubicación', () => {
  it('detecta superposición entre items y con muros, no el simple contacto', () => {
    const bench = benchWithRoom();
    const a = place(bench, 1000, 1200);
    const b = place(bench, 1800, 1200); // se superpone 600 mm con a
    const c = place(bench, 3500, 1200); // atraviesa el muro este (cara interior en x = 4000)
    const d = place(bench, 1000, 1200 + 2000); // toca el borde norte de a... y el muro norte
    const warnings = itemWarnings(level(bench), envelopeOf);
    expect(warnings.get(a)).toBe('overlap');
    expect(warnings.get(b)).toBe('overlap');
    expect(warnings.get(c)).toBe('wall');
    expect(warnings.get(d)).toBe('wall');
    bench.run(updateItem, { levelId: bench.levelId, itemId: b, position: { x: 2400 } });
    bench.run(deleteItems, { levelId: bench.levelId, itemIds: [c, d] });
    // a y b quedan lado a lado, tocándose sin superponerse.
    expect(itemWarnings(level(bench), envelopeOf).size).toBe(0);
  });
});

describe('montajes', () => {
  it('lo plano (alfombras) no se superpone y la altura de la base separa', () => {
    const bench = benchWithRoom();
    const rug = place(bench, 2000, 1500);
    const bed = place(bench, 2000, 1500);
    const flat: ItemEnvelope = { width: 2000, depth: 1400, height: 10 };
    const envelope = (item: { id: string }) => (item.id === rug ? flat : BED);
    expect(itemWarnings(level(bench), envelope).size).toBe(0);
    // Dos camas en el mismo lugar, una flotando sobre la otra (p. ej. una repisa alta): sin aviso.
    const shelf = place(bench, 2000, 1500);
    bench.run(updateItem, { levelId: bench.levelId, itemId: shelf, position: { z: 1000 } });
    const warnings = itemWarnings(level(bench), envelope);
    expect(warnings.has(shelf)).toBe(false);
    expect(warnings.has(bed)).toBe(false);
  });

  it('un item de muro siempre se apoya en el muro más cercano', () => {
    const bench = benchWithRoom();
    const frame: ItemEnvelope = { width: 600, depth: 30, height: 800 };
    // En el centro del recinto, lejos de todo muro: se va al más cercano (sur o norte a 1,5 m).
    const snap = snapItemPlacement(level(bench), { x: 2000, y: 1400 }, 0, frame, {
      wallMounted: true,
    });
    expect(snap.againstWall).toBe(true);
    expect(snap.position.y).toBe(15);
    expect(snap.rotation).toBe(180);
  });

  it('la altura del cielo es la del recinto', () => {
    const bench = benchWithRoom();
    expect(ceilingHeightAt(level(bench), { x: 2000, y: 1500 })).toBe(2400);
  });
});

describe('ajuste a muros al arrastrar', () => {
  it('apoya el respaldo en el muro más cercano y gira el frente hacia el recinto', () => {
    const bench = benchWithRoom();
    // Cerca del muro norte (cara interior y = 3000), girada de cualquier forma.
    const snap = snapItemPlacement(level(bench), { x: 2000, y: 3000 - 1000 - 120 }, 33, BED);
    expect(snap.againstWall).toBe(true);
    expect(snap.rotation).toBe(0);
    expect(snap.position).toEqual({ x: 2000, y: 3000 - BED.depth / 2 });
  });

  it('se alinea con la esquina si el costado queda cerca', () => {
    const bench = benchWithRoom();
    // Cerca del muro oeste (x = 0): frente hacia el este (rotación 90°), costado contra el sur.
    const snap = snapItemPlacement(level(bench), { x: 1100, y: 800 }, 0, BED);
    expect(snap.rotation).toBe(90);
    expect(snap.position.x).toBe(BED.depth / 2);
    expect(snap.position.y).toBe(BED.width / 2);
  });

  it('sin muros cerca redondea a la grilla', () => {
    const bench = benchWithRoom();
    const snap = snapItemPlacement(level(bench), { x: 2004, y: 1497 }, 15, {
      width: 400,
      depth: 400,
      height: 900,
    });
    expect(snap).toEqual({
      position: { x: 2000, y: 1500 },
      rotation: 15,
      againstWall: false,
      neighbors: [],
    });
  });

  // Recinto interior de 0..4000 × 0..3000.
  const NIGHTSTAND = { width: 500, depth: 400, height: 550 };
  const box = (x1: number, y1: number, x2: number, y2: number) => [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];

  it('se junta al costado de otro mueble y alinea su respaldo', () => {
    const bench = benchWithRoom();
    // Cama de 1400 × 2000 con el respaldo en y = 2500.
    const bed = box(300, 500, 1700, 2500);
    const snap = snapItemPlacement(level(bench), { x: 2010, y: 2330 }, 0, NIGHTSTAND, {
      neighbors: [bed],
    });
    expect(snap.position).toEqual({ x: 1950, y: 2300 });
    expect(snap.neighbors).toEqual([0]);
    expect(snap.againstWall).toBe(false);
  });

  it('contra un muro, se desliza a lo largo de él hasta el mueble vecino', () => {
    const bench = benchWithRoom();
    const cabinet = box(1000, 2600, 1500, 3000);
    const snap = snapItemPlacement(level(bench), { x: 1790, y: 2780 }, 0, NIGHTSTAND, {
      neighbors: [cabinet],
    });
    expect(snap.againstWall).toBe(true);
    // Sigue apoyado en el muro norte (y = 3000) y queda pegado al costado del vecino (x = 1500).
    expect(snap.position.y).toBe(2800);
    expect(snap.position.x).toBe(1750);
    expect(snap.neighbors).toEqual([0]);
  });

  it('lejos de otros muebles no se ajusta a ellos', () => {
    const bench = benchWithRoom();
    const snap = snapItemPlacement(level(bench), { x: 2000, y: 1500 }, 0, NIGHTSTAND, {
      neighbors: [box(300, 500, 900, 900)],
    });
    expect(snap.position).toEqual({ x: 2000, y: 1500 });
    expect(snap.neighbors).toEqual([]);
  });
});
