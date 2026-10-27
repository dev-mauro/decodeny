import type { Level, Opening } from '@decodeny/domain';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { isOperable, type DoorStore } from './doors';

/** Las puertas del recorrido (solo en los modos de recorrido y vuelo; en edición, `null`). */
export const DoorStoreContext = createContext<DoorStore | null>(null);

const noSubscribe = () => () => undefined;

/** Apertura (0–1) de una puerta en el recorrido; `undefined` fuera de él o si no se abre. */
export function useDoorOpenness(opening: Opening): number | undefined {
  const store = useContext(DoorStoreContext);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noSubscribe(),
    [store],
  );
  return useSyncExternalStore(subscribe, () =>
    store && isOperable(opening) ? store.get(opening).openness : undefined,
  );
}

/** Ids de las puertas cerradas (las que tienen colisión), estables mientras no cambien. */
export function useClosedDoors(level: Level): readonly string[] {
  const store = useContext(DoorStoreContext);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noSubscribe(),
    [store],
  );
  const key = useSyncExternalStore(subscribe, () => store?.closedIds(level).join(' ') ?? '');
  return useMemo(() => (key ? key.split(' ') : []), [key]);
}
