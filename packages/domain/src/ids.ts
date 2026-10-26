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
