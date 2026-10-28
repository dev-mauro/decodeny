import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { ElevatorState, ElevatorStore } from './elevators';

/** Los ascensores del recorrido (solo en los modos de recorrido y vuelo; en edición, `null`). */
export const ElevatorStoreContext = createContext<ElevatorStore | null>(null);

const noSubscribe = () => () => undefined;
const AT_BASE: ElevatorState = { offset: 0, target: 0, door: 1 };

/** Estado de la plataforma de un ascensor; en edición, en la planta baja del ascensor. */
export function useElevatorState(id: string): ElevatorState {
  const store = useContext(ElevatorStoreContext);
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noSubscribe(),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store?.get(id) ?? AT_BASE);
}
