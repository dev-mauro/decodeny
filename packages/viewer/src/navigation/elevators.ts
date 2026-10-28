import {
  ELEVATOR_DOOR,
  elevatorFinish,
  localPolygonToPlan,
  resolveItemDefinition,
  type ElevatorFinish,
} from '@decodeny/catalog';
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
 * (`floorOpening`, la cabina) que atraviesa `openingSpan` losas. La plataforma sube y baja y las
 * puertas correderas de cada parada se abren y cierran sin tocar el documento, como las puertas
 * (ver `doors.ts`).
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
  readonly finish: ElevatorFinish;
  /** Elevación de la planta donde está el ascensor (mm). */
  readonly base: number;
  readonly stops: readonly ElevatorStop[];
  /** Cabina en el marco local del item (mm): `x` de lado a lado, `z` del fondo al frente. */
  readonly cabin: { readonly x: readonly [number, number]; readonly z: readonly [number, number] };
  /** Cabina en planta (mm), para saber quién está adentro. */
  readonly footprint: readonly Vec2[];
  /** Ancho libre de la puerta (mm): a los costados, un frente fijo donde se guardan las hojas. */
  readonly doorWidth: number;
  /** Altura del techo del ducto sobre la planta del ascensor (mm). */
  readonly top: number;
}

/** Ancho del paño fijo a cada lado de la puerta y paso libre mínimo (mm). */
const DOOR_SIDE = 200;
const DOOR_MIN = 600;

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
      const width = Math.max(...xs) - Math.min(...xs);
      const height = typeof params.height === 'number' ? params.height : stops.at(-1)!.offset;
      return [
        {
          id: item.id,
          item,
          finish: elevatorFinish(item.def),
          base: level.elevation,
          stops,
          cabin: { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] },
          footprint: localPolygonToPlan(item, opening),
          doorWidth: Math.max(Math.min(DOOR_MIN, width), width - 2 * DOOR_SIDE),
          top: height + ELEVATOR_DOOR.cabin,
        },
      ];
    }),
  );
}

/** Un punto del marco local de la cabina en planta. */
export const cabinToPlan = (elevator: Elevator, x: number, z: number): Vec2 =>
  itemLocalToPlan(elevator.item, x, z);

/** Ascensor con el que se puede hacer algo: llamarlo a esta parada o usar su botonera. */
export interface NearbyElevator {
  readonly action: 'call' | 'panel';
  readonly stops: readonly { readonly levelId: string; readonly name: string }[];
  /** Parada donde está detenida la plataforma (con `panel`) o la de la persona (con `call`). */
  readonly current: string;
}

export interface ElevatorState {
  /** Altura actual de la plataforma sobre la planta del ascensor (mm). */
  readonly offset: number;
  readonly target: number;
  /** Apertura (0–1) de las puertas de la parada donde está la plataforma. */
  readonly door: number;
}

/** Espesor de la plataforma (mm): su cara de arriba es el piso de la parada. */
export const PLATFORM_MM = 60;

/** Velocidad de la plataforma (mm/s) y segundos que tardan las puertas en abrirse o cerrarse. */
export const ELEVATOR_SPEED = 1000;
export const ELEVATOR_DOOR_S = 0.8;

export interface ElevatorStore {
  get(id: string): ElevatorState;
  /** Manda la plataforma a una altura (la de una parada): cierra, viaja y abre. */
  travel(id: string, target: number): void;
  /** Avanza el viaje y las puertas; devuelve si algo se movió. */
  step(dt: number): boolean;
  subscribe(listener: () => void): () => void;
  version(): number;
}

/** Al empezar, cada plataforma está en la planta del ascensor con las puertas abiertas. */
const AT_BASE: ElevatorState = { offset: 0, target: 0, door: 1 };

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
      const doorStep = dt / ELEVATOR_DOOR_S;
      for (const [id, s] of states) {
        let next = s;
        if (s.offset !== s.target) {
          // Antes de salir se cierran las puertas.
          if (s.door > 0) next = { ...s, door: Math.max(0, s.door - doorStep) };
          else {
            const delta = ELEVATOR_SPEED * dt;
            const offset =
              s.target > s.offset
                ? Math.min(s.target, s.offset + delta)
                : Math.max(s.target, s.offset - delta);
            next = { ...s, offset };
          }
        } else if (s.door < 1) {
          next = { ...s, door: Math.min(1, s.door + doorStep) };
        }
        if (next !== s) {
          states.set(id, next);
          moved = true;
        }
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

/** Apertura de las puertas de una parada: solo las de la parada donde está la plataforma. */
export const doorOpenness = (state: ElevatorState, stop: ElevatorStop): number =>
  stop.offset === state.offset ? state.door : 0;

/** Paradas con las puertas cerradas (o a medio abrir): no se pasa. */
export function closedStops(elevator: Elevator, state: ElevatorState): ElevatorStop[] {
  return elevator.stops.filter((stop) => doorOpenness(state, stop) < 1);
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

/** Botonera: en la pared derecha de la cabina (vista desde la puerta), cerca de la entrada. */
export function panelSpot(elevator: Elevator): { readonly x: number; readonly z: number } {
  return { x: elevator.cabin.x[1], z: elevator.cabin.z[1] - 350 };
}

/** Alcance (mm) para usar la botonera o llamar al ascensor. */
const REACH = 1300;
/** Hay que mirar más o menos hacia lo que se usa (coseno del ángulo). */
const FACING = 0.35;

export interface ElevatorAction {
  readonly elevator: Elevator;
  readonly action: 'call' | 'panel';
  readonly stop: ElevatorStop;
}

/**
 * Qué se puede hacer con un ascensor desde donde está la persona (pies en planta y altura, mm),
 * mirando en la dirección `view` (planta): dentro y detenido, usar la botonera (al alcance);
 * afuera, frente a sus puertas cerradas, llamarlo a esta parada.
 */
export function elevatorAction(
  elevators: readonly Elevator[],
  store: ElevatorStore,
  at: Vec2,
  feetMm: number,
  view: Vec2,
): ElevatorAction | null {
  const facing = (target: Vec2) => {
    const dx = target.x - at.x;
    const dy = target.y - at.y;
    const d = Math.hypot(dx, dy) || 1;
    return { distance: d, cos: (dx * view.x + dy * view.y) / d };
  };
  const inside = elevatorUnder(elevators, store, at, feetMm);
  if (inside) {
    const stop = currentStop(inside, store.get(inside.id));
    if (!stop) return null;
    // La cabina es chica: la botonera siempre queda al alcance.
    return { elevator: inside, action: 'panel', stop };
  }
  for (const elevator of elevators) {
    const state = store.get(elevator.id);
    const { x, z } = elevator.cabin;
    const front = cabinToPlan(elevator, (x[0] + x[1]) / 2, z[1]);
    const outward = cabinToPlan(elevator, (x[0] + x[1]) / 2, z[1] + 1);
    const n = { x: outward.x - front.x, y: outward.y - front.y };
    for (const stop of elevator.stops) {
      if (Math.abs(feetMm - (elevator.base + stop.offset)) > ON_PLATFORM_MM) continue;
      // Ya está aquí, con las puertas abiertas: se entra caminando.
      if (stop.offset === state.target && doorOpenness(state, stop) === 1) continue;
      const ahead = (at.x - front.x) * n.x + (at.y - front.y) * n.y;
      const f = facing(front);
      if (ahead > 0 && f.distance <= REACH && f.cos >= FACING) {
        return { elevator, action: 'call', stop };
      }
    }
  }
  return null;
}
