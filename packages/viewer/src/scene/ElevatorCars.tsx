import { ELEVATOR_DOOR } from '@decodeny/catalog';
import { mmToMeters } from '@decodeny/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useContext } from 'react';
import { planToWorld } from '../coords';
import { itemMaterial } from '../materials/default-materials';
import { ElevatorStoreContext, useElevatorState } from '../navigation/elevator-context';
import {
  doorOpenness,
  panelSpot,
  PLATFORM_MM,
  type Elevator,
  type ElevatorStop,
} from '../navigation/elevators';
import { requestShadowUpdate } from './shadow-updates';

/** Frente de cada parada: paños fijos y puertas, delante del ducto (mm). */
export const FRONT_MM = 20;

/**
 * Ascensores: la plataforma con su botonera y, en cada parada, el frente con sus puertas
 * correderas (se abren donde está la plataforma). En el recorrido todo se mueve (el almacén de
 * ascensores avanza aquí); en edición, la plataforma queda abajo con las puertas abiertas.
 */
export function ElevatorCars({ elevators }: { readonly elevators: readonly Elevator[] }) {
  const store = useContext(ElevatorStoreContext);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    if (store?.step(Math.min(dt, 0.1))) {
      requestShadowUpdate(gl);
      invalidate();
    }
  });
  return elevators.map((elevator) => <ElevatorCar key={elevator.id} elevator={elevator} />);
}

/** Caja por sus límites en mm (marco local del ascensor). */
function Slab({
  x,
  y,
  z,
  slot,
  lit = false,
}: {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
  readonly slot: string;
  readonly lit?: boolean;
}) {
  return (
    <mesh
      position={[
        mmToMeters((x[0] + x[1]) / 2),
        mmToMeters((y[0] + y[1]) / 2),
        mmToMeters((z[0] + z[1]) / 2),
      ]}
      material={itemMaterial(slot, 'normal', undefined, lit)}
      castShadow
      receiveShadow
    >
      <boxGeometry
        args={[mmToMeters(x[1] - x[0]), mmToMeters(y[1] - y[0]), mmToMeters(z[1] - z[0])]}
      />
    </mesh>
  );
}

function ElevatorCar({ elevator }: { readonly elevator: Elevator }) {
  const state = useElevatorState(elevator.id);
  const { x, z } = elevator.cabin;
  const panel = panelSpot(elevator);
  return (
    <group
      position={planToWorld(elevator.item.position, elevator.base)}
      rotation-y={(elevator.item.rotation * Math.PI) / 180}
    >
      <Slab x={x} y={[state.offset - PLATFORM_MM, state.offset]} z={z} slot="stone" />
      {/* Botonera, en la pared derecha cerca de la puerta: viaja con la plataforma. */}
      <Slab
        x={[panel.x - 4, panel.x + 16]}
        y={[state.offset + 950, state.offset + 1300]}
        z={[panel.z - 90, panel.z + 90]}
        slot="black"
      />
      {[1000, 1090, 1180].map((h) => (
        <Slab
          key={h}
          x={[panel.x - 10, panel.x - 4]}
          y={[state.offset + h, state.offset + h + 50]}
          z={[panel.z - 25, panel.z + 25]}
          slot="bulb"
          lit
        />
      ))}
      {elevator.stops.map((stop, i) => (
        <StopFront
          key={stop.levelId}
          elevator={elevator}
          stop={stop}
          next={elevator.stops[i + 1]?.offset ?? elevator.top - ELEVATOR_DOOR.frame}
          open={doorOpenness(state, stop)}
        />
      ))}
    </group>
  );
}

/** Frente de una parada: paños fijos a los costados, dintel hasta la siguiente y dos hojas. */
function StopFront({
  elevator,
  stop,
  next,
  open,
}: {
  readonly elevator: Elevator;
  readonly stop: ElevatorStop;
  /** Altura (mm) hasta donde llega el dintel: la parada de arriba o el techo del ducto. */
  readonly next: number;
  readonly open: number;
}) {
  const { x, z } = elevator.cabin;
  const glass = elevator.finish === 'glass';
  const panelSlot = glass ? 'glass' : 'steel';
  const half = elevator.doorWidth / 2;
  const doorTop = stop.offset + ELEVATOR_DOOR.height;
  const front: [number, number] = [z[1] - FRONT_MM, z[1]];
  const leaf: [number, number] = [z[1] - FRONT_MM - ELEVATOR_DOOR.thickness, z[1] - FRONT_MM - 4];
  // Cada hoja corre hacia su costado y queda detrás del paño fijo.
  const slide = open * half;
  return (
    <>
      <Slab x={[x[0], -half]} y={[stop.offset, doorTop]} z={front} slot={panelSlot} />
      <Slab x={[half, x[1]]} y={[stop.offset, doorTop]} z={front} slot={panelSlot} />
      {next > doorTop && (
        <Slab x={x} y={[doorTop, next]} z={front} slot={glass ? 'metal' : 'steel'} />
      )}
      <Slab x={[-half - slide, -slide]} y={[stop.offset, doorTop - 10]} z={leaf} slot={panelSlot} />
      <Slab x={[slide, half + slide]} y={[stop.offset, doorTop - 10]} z={leaf} slot={panelSlot} />
      {/* En el vidrio, el canto de las hojas muestra dónde está la puerta. */}
      {glass && (
        <>
          <Slab x={[-slide - 20, -slide]} y={[stop.offset, doorTop - 10]} z={leaf} slot="metal" />
          <Slab x={[slide, slide + 20]} y={[stop.offset, doorTop - 10]} z={leaf} slot="metal" />
        </>
      )}
    </>
  );
}
