import {
  createEmptyProject,
  createRectangularRoom,
  executeCommand,
  sequentialIds,
  type Level,
} from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import {
  chooseSpawn,
  groundCollider,
  roomAt,
  spawnInRoom,
  wallColliders,
  worldToPlan,
} from './colliders';
import { BOB_AMPLITUDE, createHeadBob, stepHeadBob } from './head-bob';
import { combineIntent, consumeLook, createVirtualInput, joystickVector } from './virtual-input';
import { horizontalDirection, intentFromKeys, NO_MOVEMENT } from './input';
import { capsuleDimensions, DEFAULT_PERSON } from './person-profile';

function levelWithRoom(): Level {
  const ids = sequentialIds();
  const project = createEmptyProject({ name: 'P', levelName: 'L', generator: 'test', ids });
  const out = executeCommand(
    project,
    createRectangularRoom,
    {
      levelId: project.levels[0]!.id,
      name: 'R',
      origin: { x: 0, y: 0 },
      width: 4000,
      depth: 3000,
      height: 2400,
      thickness: 200,
    },
    { ids },
  );
  return out.project.levels[0]!;
}

describe('perfil de persona', () => {
  it('ubica los ojos a 1,60 m para una persona de 1,70 m', () => {
    const d = capsuleDimensions(DEFAULT_PERSON);
    expect(d.radius).toBeCloseTo(0.25);
    expect(d.centerY).toBeCloseTo(0.85);
    expect(d.halfHeight).toBeCloseTo(0.6);
    expect(d.centerY + d.eyeOffset).toBeCloseTo(1.6);
    // La cápsula completa mide exactamente la estatura.
    expect(2 * (d.halfHeight + d.radius)).toBeCloseTo(1.7);
  });

  it('limita el radio a la mitad de la estatura', () => {
    const d = capsuleDimensions({ ...DEFAULT_PERSON, heightMm: 400, radiusMm: 300 });
    expect(d.radius).toBeCloseTo(0.2);
    expect(d.halfHeight).toBe(0);
  });
});

describe('colisionadores', () => {
  it('genera una caja por muro que cubre largo + espesor y alto', () => {
    const boxes = wallColliders(levelWithRoom());
    expect(boxes).toHaveLength(4);
    const south = boxes[0]!;
    // Muro sur: eje de x = −0,1 a 4,1 (4,2 m) más 0,2 m de espesor.
    expect(south.halfExtents[0]).toBeCloseTo((4.2 + 0.2) / 2);
    expect(south.halfExtents[1]).toBeCloseTo(1.2);
    expect(south.halfExtents[2]).toBeCloseTo(0.1);
    expect(south.position[1]).toBeCloseTo(1.2);
    expect(south.position[2]).toBeCloseTo(0.1);
    expect(south.rotationY).toBeCloseTo(0);
    expect(boxes[1]!.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it('crea un suelo continuo bajo el nivel', () => {
    const ground = groundCollider(levelWithRoom());
    expect(ground.position[1]).toBeLessThan(0);
    expect(ground.halfExtents[0]).toBeGreaterThan(10);
  });

  it('el suelo de un nivel vacío queda en el origen', () => {
    const level: Level = {
      id: 'l',
      name: 'L',
      elevation: 0,
      nodes: [],
      walls: [],
      openings: [],
      rooms: [],
      items: [],
    };
    expect(groundCollider(level).position[0]).toBe(0);
    expect(wallColliders(level)).toEqual([]);
  });
});

describe('aparición', () => {
  it('aparece en el centro del recinto, sobre el piso', () => {
    const level = levelWithRoom();
    const spawn = spawnInRoom(level, level.rooms[0]!, 1.2);
    expect(spawn.feet[0]).toBeCloseTo(2);
    expect(spawn.feet[1]).toBe(0);
    expect(spawn.feet[2]).toBeCloseTo(-1.5);
    expect(spawn.yaw).toBe(1.2);
  });

  it('detecta en qué recinto está un punto del mundo', () => {
    const level = levelWithRoom();
    expect(roomAt(level, worldToPlan(2, -1.5))?.name).toBe('R');
    expect(roomAt(level, worldToPlan(20, 0))).toBeUndefined();
  });
});

describe('intención de movimiento', () => {
  it('combina teclas en ejes', () => {
    expect(intentFromKeys(new Set())).toEqual(NO_MOVEMENT);
    expect(intentFromKeys(new Set(['KeyW', 'KeyD', 'ShiftLeft']))).toEqual({
      forward: 1,
      right: 1,
      up: 0,
      run: true,
    });
    expect(intentFromKeys(new Set(['KeyW', 'KeyS', 'Space']))).toMatchObject({ forward: 0, up: 1 });
    expect(intentFromKeys(new Set(['ArrowDown', 'ArrowLeft', 'KeyC']))).toMatchObject({
      forward: -1,
      right: -1,
      up: -1,
    });
  });

  it('convierte la intención en dirección horizontal según el rumbo', () => {
    const forward = { forward: 1, right: 0, up: 0, run: false };
    const [x0, z0] = horizontalDirection(forward, 0);
    expect(x0).toBeCloseTo(0);
    expect(z0).toBeCloseTo(-1);
    const [x1, z1] = horizontalDirection(forward, Math.PI / 2);
    expect(x1).toBeCloseTo(-1);
    expect(z1).toBeCloseTo(0);
    // En diagonal no se avanza más rápido.
    const [dx, dz] = horizontalDirection({ ...forward, right: 1 }, 0);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1);
  });
});

describe('balanceo de cabeza', () => {
  it('quieto no se mueve; caminando oscila dentro de la amplitud y se apaga al detenerse', () => {
    const state = createHeadBob();
    for (let i = 0; i < 60; i++) expect(Math.abs(stepHeadBob(state, 0, 1 / 60))).toBe(0);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 180; i++) {
      const y = stepHeadBob(state, 1.4, 1 / 60);
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    expect(max - min).toBeGreaterThan(BOB_AMPLITUDE * 0.8);
    expect(max - min).toBeLessThanOrEqual(BOB_AMPLITUDE + 1e-9);
    for (let i = 0; i < 120; i++) stepHeadBob(state, 0, 1 / 60);
    expect(Math.abs(stepHeadBob(state, 0, 1 / 60))).toBeLessThan(0.001);
  });
});

describe('punto de partida del recorrido', () => {
  it('aparece en el punto elegido si cae en un recinto; si no, en el recinto', () => {
    const level = levelWithRoom();
    const outside = { position: { x: 100, z: 100 } };
    const chosen = chooseSpawn(level, null, outside, 0.5, { x: 1000, y: 2000 });
    expect(chosen.feet[0]).toBeCloseTo(1);
    expect(chosen.feet[2]).toBeCloseTo(-2);
    expect(chosen.yaw).toBe(0.5);
    const fallback = chooseSpawn(level, null, outside, 0, { x: 50_000, y: 0 });
    const room = spawnInRoom(level, level.rooms[0]!, 0);
    expect(fallback.feet).toEqual(room.feet);
  });
});

describe('controles táctiles', () => {
  it('el joystick normaliza, tiene zona muerta y corre en el borde', () => {
    expect(joystickVector(2, 2, 50)).toMatchObject({ x: 0, y: 0, run: false });
    const half = joystickVector(0, -25, 50);
    expect(half.y).toBeCloseTo(0.5);
    expect(half.run).toBe(false);
    const edge = joystickVector(100, 0, 50);
    expect(edge.x).toBeCloseTo(1);
    expect(edge.knob).toEqual({ x: 50, y: 0 });
    expect(edge.run).toBe(true);
  });

  it('se suma al teclado sin pasar de ±1 y la mirada se consume una vez', () => {
    const input = createVirtualInput();
    input.move = { x: 0.6, y: 0.8 };
    input.look = { dx: 10, dy: -4 };
    const intent = combineIntent({ forward: 1, right: 0, up: 0, run: false }, input);
    expect(intent).toEqual({ forward: 1, right: 0.6, up: 0, run: false });
    expect(consumeLook(input)).toEqual({ dx: 10, dy: -4 });
    expect(consumeLook(input)).toBeNull();
  });
});
