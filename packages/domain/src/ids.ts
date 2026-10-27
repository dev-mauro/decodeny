import { customAlphabet } from 'nanoid';

export type IdPrefix =
  'proj' | 'lvl' | 'node' | 'wall' | 'room' | 'open' | 'item' | 'mat' | 'asset';

/** Genera identificadores únicos. Se inyecta en los comandos para tener tests deterministas. */
export type IdFactory = (prefix: IdPrefix) => string;

const randomPart = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export const createId: IdFactory = (prefix) => `${prefix}_${randomPart()}`;

/** Fábrica secuencial para tests y fixtures: `wall_1`, `wall_2`, … */
export function sequentialIds(): IdFactory {
  const counters = new Map<IdPrefix, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };
}

/** Fábrica que además anota cada id generado (para poder reproducir la ejecución). */
export function recordingIds(base: IdFactory = createId): { ids: IdFactory; recorded: string[] } {
  const recorded: string[] = [];
  return {
    recorded,
    ids: (prefix) => {
      const id = base(prefix);
      recorded.push(id);
      return id;
    },
  };
}

/**
 * Reproduce ids anotados, en orden: ejecutar el mismo comando con los mismos argumentos y estos
 * ids da el mismo resultado en otro equipo. Si se agotan (o no coincide el prefijo), usa `fallback`.
 */
export function replayIds(recorded: readonly string[], fallback: IdFactory = createId): IdFactory {
  let next = 0;
  return (prefix) => {
    const id = recorded[next];
    if (id?.startsWith(`${prefix}_`)) {
      next++;
      return id;
    }
    return fallback(prefix);
  };
}
