import { resolveOpeningDefinition } from '@decodeny/catalog';
import {
  add,
  isDesignedClosed,
  openingEnvelope,
  scale,
  type Level,
  type Opening,
  type Vec2,
  type WallFootprint,
} from '@decodeny/domain';

/**
 * Puertas en el recorrido: cada una se abre y se cierra sin tocar el documento (sirve en solo
 * lectura, en presentación y como invitado). `openness`: 0 cerrada, 1 abierta; `target` es hacia
 * dónde va. Solo una puerta **cerrada** (quieta en 0) bloquea el paso.
 */
export interface DoorState {
  readonly openness: number;
  readonly target: 0 | 1;
}

/** Segundos que tarda en abrirse o cerrarse del todo. */
export const DOOR_TRAVEL_S = 0.7;

export interface DoorStore {
  /** Estado de una puerta (si nunca se tocó, el del documento). */
  get(opening: Opening): DoorState;
  toggle(opening: Opening): void;
  /** Avanza la animación; devuelve si algo se movió. */
  step(dt: number): boolean;
  /** Puertas cerradas del nivel (las que tienen colisión). */
  closedIds(level: Level): readonly string[];
  subscribe(listener: () => void): () => void;
  /** Cambia con cada movimiento (para `useSyncExternalStore`). */
  version(): number;
}

const designed = (opening: Opening): DoorState => {
  const closed = isDesignedClosed(resolveOpeningDefinition(opening.def), opening.params);
  return closed ? { openness: 0, target: 0 } : { openness: 1, target: 1 };
};

export const isOperable = (opening: Opening): boolean =>
  resolveOpeningDefinition(opening.def).operable !== undefined;

export function createDoorStore(): DoorStore {
  const states = new Map<string, DoorState>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  const store: DoorStore = {
    get: (opening) => states.get(opening.id) ?? designed(opening),
    toggle: (opening) => {
      const current = store.get(opening);
      states.set(opening.id, { ...current, target: current.target === 1 ? 0 : 1 });
      emit();
    },
    step: (dt) => {
      let moved = false;
      for (const [id, s] of states) {
        if (s.openness === s.target) continue;
        const delta = dt / DOOR_TRAVEL_S;
        const openness =
          s.target === 1 ? Math.min(1, s.openness + delta) : Math.max(0, s.openness - delta);
        states.set(id, { ...s, openness });
        moved = true;
      }
      if (moved) emit();
      return moved;
    },
    closedIds: (level) =>
      level.openings
        .filter((o) => isOperable(o))
        .filter((o) => {
          const s = store.get(o);
          return s.openness === 0 && s.target === 0;
        })
        .map((o) => o.id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
  return store;
}

/** Centro del vano en planta (sobre el eje del muro). */
export function doorCenter(opening: Opening, footprint: WallFootprint): Vec2 {
  return add(footprint.start, scale(footprint.dir, opening.offset));
}

/** A qué distancia (mm) del vano se lo puede abrir o cerrar. */
export const DOOR_REACH = 1800;
/** Al lado de la puerta (mm): se usa aunque no se la mire. */
const NEAR_DOOR = 900;

/**
 * La puerta que se usaría ahora: la más cercana al alcance, de frente (o casi encima). `eye` y
 * `forward` en planta (mm y dirección unitaria).
 */
export function nearestDoor(
  level: Level,
  footprints: ReadonlyMap<string, WallFootprint>,
  eye: Vec2,
  forward: Vec2,
): Opening | null {
  let best: Opening | null = null;
  let bestScore = Infinity;
  for (const opening of level.openings) {
    if (!isOperable(opening)) continue;
    const fp = footprints.get(opening.wallId);
    if (!fp) continue;
    const c = doorCenter(opening, fp);
    const dx = c.x - eye.x;
    const dy = c.y - eye.y;
    const d = Math.hypot(dx, dy);
    if (d > DOOR_REACH) continue;
    const facing = d === 0 ? 1 : (dx * forward.x + dy * forward.y) / d;
    // De frente, o al lado (menos de ~0,9 m) aunque se mire de costado.
    if (facing < 0.35 && d > Math.max(NEAR_DOOR, openingEnvelope(opening).width * 0.75)) continue;
    const score = d * (1.5 - facing);
    if (score < bestScore) {
      bestScore = score;
      best = opening;
    }
  }
  return best;
}

/**
 * Cerrar la puerta con la persona en el vano la dejaría atrapada en la colisión: solo se cierra
 * si está fuera de la franja de la hoja (radio de la cápsula incluido).
 */
export function canClose(
  opening: Opening,
  footprint: WallFootprint,
  eye: Vec2,
  radius: number,
): boolean {
  const c = doorCenter(opening, footprint);
  const rel = { x: eye.x - c.x, y: eye.y - c.y };
  const along = Math.abs(rel.x * footprint.dir.x + rel.y * footprint.dir.y);
  const across = Math.abs(-rel.x * footprint.dir.y + rel.y * footprint.dir.x);
  const half = openingEnvelope(opening).width / 2;
  return !(along < half + radius && across < footprint.thickness / 2 + radius);
}
