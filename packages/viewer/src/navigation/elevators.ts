import { localPolygonToPlan, resolveItemDefinition } from '@decodeny/catalog';
import {
  itemLocalToPlan,
  pointInPolygon,
  resolveParams,
  type Item,
  type Level,
  type Vec2,
} from '@decodeny/domain';

/**
 * Ascensores en el recorrido (I12): un item con la afordancia `travel` y un hueco de losa
 * (`floorOpening`, la cabina) que atraviesa `openingSpan` losas. La plataforma sube y baja sin
 * tocar el documento, como las puertas (ver `doors.ts`).
 */
export interface ElevatorStop {
  readonly levelId: string;
  readonly name: string;
  /** Altura del piso de la parada sobre la planta del ascensor (mm). */
  readonly offset: number;
}

export interface Elevator {
  readonly id: string;
  readonly item: Item;
  /** Elevación de la planta donde está el ascensor (mm). */
  readonly base: number;
  readonly stops: readonly ElevatorStop[];
  /** Cabina en el marco local del item (mm): `x` de lado a lado, `z` del fondo al frente. */
  readonly cabin: { readonly x: readonly [number, number]; readonly z: readonly [number, number] };
  /** Cabina en planta (mm), para saber quién está adentro. */
  readonly footprint: readonly Vec2[];
}

/** Los ascensores del proyecto, con sus paradas (`levels`, de abajo hacia arriba). */
export function projectElevators(levels: readonly Level[]): Elevator[] {
  return levels.flatMap((level, index) =>
    level.items.flatMap((item): Elevator[] => {
      const definition = resolveItemDefinition(item.def);
      const params = resolveParams(definition.params, item.params);
      const travels = definition.affordances?.(params).some((a) => a.kind === 'travel');
      const opening = definition.floorOpening?.(params);
      if (!travels || !opening || opening.length < 3) return [];
      const span = definition.openingSpan?.(params) ?? 1;
      const stops = levels.slice(index, index + span + 1).map((l) => ({
        levelId: l.id,
        name: l.name,
        offset: l.elevation - level.elevation,
      }));
      if (stops.length < 2) return [];
      const xs = opening.map(([x]) => x);
      const zs = opening.map(([, z]) => z);
      return [
        {
          id: item.id,
          item,
          base: level.elevation,
          stops,
          cabin: { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] },
          footprint: localPolygonToPlan(item, opening),
        },
      ];
    }),
  );
}

/** Un punto del marco local de la cabina en planta. */
export const cabinToPlan = (elevator: Elevator, x: number, z: number): Vec2 =>
  itemLocalToPlan(elevator.item, x, z);

/** Ascensor en el que está la persona, detenido en una parada (para ofrecer los pisos). */
export interface NearbyElevator {
  readonly stops: readonly { readonly levelId: string; readonly name: string }[];
  /** Planta donde está detenido. */
  readonly current: string;
}

export interface ElevatorState {
  /** Altura actual de la plataforma sobre la planta del ascensor (mm). */
  readonly offset: number;
  readonly target: number;
}

/** Espesor de la plataforma (mm): su cara de arriba es el piso de la parada. */
export const PLATFORM_MM = 60;
/** Reja de las paradas donde no está la plataforma: alto y espesor (mm). */
export const GATE_HEIGHT = 1100;
export const GATE_MM = 40;

/** Velocidad de la plataforma (mm/s). */
export const ELEVATOR_SPEED = 1000;

export interface ElevatorStore {
  get(id: string): ElevatorState;
  /** Manda la plataforma a una altura (la de una parada). */
  travel(id: string, target: number): void;
  /** Avanza el viaje; devuelve si algo se movió. */
  step(dt: number): boolean;
  subscribe(listener: () => void): () => void;
  version(): number;
}

const AT_BASE: ElevatorState = { offset: 0, target: 0 };

export function createElevatorStore(): ElevatorStore {
  const states = new Map<string, ElevatorState>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  return {
    get: (id) => states.get(id) ?? AT_BASE,
    travel: (id, target) => {
      const current = states.get(id) ?? AT_BASE;
      if (current.target === target) return;
      states.set(id, { ...current, target });
      emit();
    },
    step: (dt) => {
      let moved = false;
      for (const [id, s] of states) {
        if (s.offset === s.target) continue;
        const delta = ELEVATOR_SPEED * dt;
        const offset =
          s.target > s.offset
            ? Math.min(s.target, s.offset + delta)
            : Math.max(s.target, s.offset - delta);
        states.set(id, { ...s, offset });
        moved = true;
      }
      if (moved) emit();
      return moved;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}

export const isMoving = (state: ElevatorState): boolean => state.offset !== state.target;

/** Paradas cerradas con reja: todas mientras viaja; si no, todas menos la de la plataforma. */
export function gatedStops(elevator: Elevator, state: ElevatorState): ElevatorStop[] {
  return elevator.stops.filter((stop) => isMoving(state) || stop.offset !== state.offset);
}

/** La parada donde está la plataforma (detenida), si está en una. */
export function currentStop(elevator: Elevator, state: ElevatorState): ElevatorStop | undefined {
  return isMoving(state) ? undefined : elevator.stops.find((s) => s.offset === state.offset);
}

/** Margen (mm) para estar "parado en la plataforma": los pies a esta distancia de ella. */
const ON_PLATFORM_MM = 300;

/** El ascensor en cuya plataforma está la persona (pies en planta y altura, mm), si alguno. */
export function elevatorUnder(
  elevators: readonly Elevator[],
  store: ElevatorStore,
  at: Vec2,
  feetMm: number,
): Elevator | undefined {
  return elevators.find((e) => {
    if (!pointInPolygon(at, e.footprint)) return false;
    const floor = e.base + store.get(e.id).offset;
    return Math.abs(feetMm - floor) <= ON_PLATFORM_MM;
  });
}
