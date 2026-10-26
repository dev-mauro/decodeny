import type { Level } from '@decodeny/domain';
import { useMemo } from 'react';
import { lampLights } from './lamp-lights';

/** Luces puntuales de las luminarias (sin sombras, para mantener el rendimiento). */
export function LevelLights({ level }: { readonly level: Level }) {
  const lights = useMemo(() => lampLights(level), [level]);
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
        />
      ))}
    </group>
  );
}
