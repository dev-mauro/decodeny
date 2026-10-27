import type { Level } from '@decodeny/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { Vec3Tuple } from '../coords';
import { lampLights, lightBudget, MAX_SHADOW_LAMPS } from './lamp-lights';

/** La selección de luces se recalcula cuando la cámara se mueve más que esto (m). */
const RESELECT_DISTANCE = 0.5;

/**
 * Luces puntuales de las luminarias con presupuesto (`lightBudget`): las más cercanas a la
 * cámara se encienden y, si `shadows`, las más próximas proyectan sombra.
 */
export function LevelLights({
  level,
  shadows,
}: {
  readonly level: Level;
  readonly shadows: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const all = useMemo(() => lampLights(level), [level]);
  const [eye, setEye] = useState<Vec3Tuple>(() => camera.position.toArray());
  const lastEye = useRef(eye);
  useFrame(() => {
    const p = camera.position;
    const [x, y, z] = lastEye.current;
    if (Math.hypot(p.x - x, p.y - y, p.z - z) < RESELECT_DISTANCE) return;
    lastEye.current = p.toArray();
    setEye(lastEye.current);
  });
  const lights = useMemo(
    () => lightBudget(all, eye, undefined, shadows ? MAX_SHADOW_LAMPS : 0),
    [all, eye, shadows],
  );
  return (
    <group name="lamp-lights">
      {lights.map((l) => (
        <pointLight
          key={l.key}
          position={l.position}
          intensity={l.intensity}
          color={l.color}
          distance={0}
          decay={2}
          castShadow={l.castShadow}
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.002}
          shadow-camera-near={0.05}
          shadow-camera-far={12}
        />
      ))}
    </group>
  );
}
