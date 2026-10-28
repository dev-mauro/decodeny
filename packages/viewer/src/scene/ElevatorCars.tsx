import { mmToMeters } from '@decodeny/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useContext } from 'react';
import { planToWorld } from '../coords';
import { itemMaterial } from '../materials/default-materials';
import { ElevatorStoreContext, useElevatorState } from '../navigation/elevator-context';
import {
  GATE_HEIGHT,
  GATE_MM,
  gatedStops,
  PLATFORM_MM,
  type Elevator,
} from '../navigation/elevators';
import { requestShadowUpdate } from './shadow-updates';

/**
 * Plataformas de los ascensores y rejas de sus paradas. En el recorrido se mueven (el almacén
 * de ascensores avanza aquí); en edición, la plataforma queda en la planta del ascensor.
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

function ElevatorCar({ elevator }: { readonly elevator: Elevator }) {
  const state = useElevatorState(elevator.id);
  const { x, z } = elevator.cabin;
  const width = mmToMeters(x[1] - x[0]);
  const depth = mmToMeters(z[1] - z[0]);
  const cx = mmToMeters((x[0] + x[1]) / 2);
  const cz = mmToMeters((z[0] + z[1]) / 2);
  return (
    <group
      position={planToWorld(elevator.item.position, elevator.base)}
      rotation-y={(elevator.item.rotation * Math.PI) / 180}
    >
      <mesh
        position={[cx, mmToMeters(state.offset - PLATFORM_MM / 2), cz]}
        material={itemMaterial('stone', 'normal')}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, mmToMeters(PLATFORM_MM), depth]} />
      </mesh>
      {gatedStops(elevator, state).map((stop) =>
        [0.45, 1].map((h) => (
          <mesh
            key={`${stop.levelId}:${h}`}
            position={[
              cx,
              mmToMeters(stop.offset + GATE_HEIGHT * h),
              mmToMeters(z[1] - GATE_MM / 2),
            ]}
            material={itemMaterial('black', 'normal')}
          >
            <boxGeometry args={[width, mmToMeters(GATE_MM), mmToMeters(GATE_MM)]} />
          </mesh>
        )),
      )}
    </group>
  );
}
