import type { Level } from '@decodeny/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointLight } from 'three';
import type { Vec3Tuple } from '../coords';
import {
  lampLights,
  lightBudget,
  MAX_LAMP_LIGHTS,
  MAX_SHADOW_LAMPS,
  type BudgetedLight,
  type LampLight,
} from './lamp-lights';
import { requestShadowUpdate } from './shadow-updates';

/** La selección de luces se recalcula cuando la cámara se mueve más que esto (m). */
const RESELECT_DISTANCE = 0.5;
/** Una luz que se enciende por cercanía llega a su intensidad en este tiempo (s). */
const FADE_IN_S = 0.3;

const sameLights = (a: readonly BudgetedLight[], b: readonly BudgetedLight[]) =>
  a.length === b.length && a.every((l, i) => l === b[i]);

/**
 * Luces puntuales de las luminarias con presupuesto (`lightBudget`): las más cercanas a la
 * cámara se encienden y, si `shadows`, las más próximas proyectan sombra. Las que ya están
 * encendidas tienen ventaja (no alternan en el límite) y las que entran al presupuesto al
 * moverse se encienden suave, sin saltos de luz.
 */
export function LevelLights({
  level,
  shadows,
}: {
  readonly level: Level;
  readonly shadows: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const all = useMemo(() => lampLights(level), [level]);
  const maxShadows = shadows ? MAX_SHADOW_LAMPS : 0;
  const budget = (lamps: readonly LampLight[], eye: Vec3Tuple, lit: ReadonlySet<string>) =>
    lightBudget(lamps, eye, MAX_LAMP_LIGHTS, maxShadows, lit);
  const [lights, setLights] = useState<readonly BudgetedLight[]>(() =>
    budget(all, camera.position.toArray(), new Set()),
  );

  // Se recalcula al moverse la cámara o al cambiar las luminarias o sus sombras.
  const lastEye = useRef<Vec3Tuple>(camera.position.toArray());
  const lastInput = useRef<{ all: readonly LampLight[]; maxShadows: number } | null>(null);
  const keys = useRef<ReadonlySet<string>>(new Set(lights.map((l) => l.key)));
  useFrame(() => {
    const p = camera.position;
    const [x, y, z] = lastEye.current;
    const moved = Math.hypot(p.x - x, p.y - y, p.z - z) >= RESELECT_DISTANCE;
    const input = lastInput.current;
    const changed = input?.all !== all || input.maxShadows !== maxShadows;
    if (!moved && !changed) return;
    lastEye.current = p.toArray();
    lastInput.current = { all, maxShadows };
    const next = budget(all, lastEye.current, keys.current);
    if (!sameLights(next, lights)) setLights(next);
  });

  const refs = useRef(new Map<string, PointLight>());
  const fading = useRef(new Map<string, number>());
  const first = useRef(true);
  // Antes del próximo cuadro: las recién sumadas arrancan apagadas y suben en `FADE_IN_S`
  // (al empezar, todas aparecen ya encendidas).
  useLayoutEffect(() => {
    const before = keys.current;
    keys.current = new Set(lights.map((l) => l.key));
    if (!first.current) {
      for (const l of lights) {
        if (before.has(l.key)) continue;
        fading.current.set(l.key, 0);
        const light = refs.current.get(l.key);
        if (light) light.intensity = 0;
      }
    }
    first.current = false;
    requestShadowUpdate(gl);
    invalidate();
  }, [gl, invalidate, lights]);
  useFrame((_, dt) => {
    if (fading.current.size === 0) return;
    for (const l of lights) {
      const t = fading.current.get(l.key);
      if (t === undefined) continue;
      const next = Math.min(1, t + dt / FADE_IN_S);
      const light = refs.current.get(l.key);
      if (light) light.intensity = l.intensity * next;
      if (next >= 1) fading.current.delete(l.key);
      else fading.current.set(l.key, next);
    }
    invalidate();
  });

  return (
    <group name="lamp-lights">
      {lights.map((l) => (
        <pointLight
          key={l.key}
          ref={(light) => {
            if (light) refs.current.set(l.key, light);
            else refs.current.delete(l.key);
          }}
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
