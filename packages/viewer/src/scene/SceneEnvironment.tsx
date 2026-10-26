import { Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Object3D, PMREMGenerator, Sphere, Vector3, type Box3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Mapa de entorno procedural (un estudio genérico, sin descargar HDRI): da reflejos a metales,
 * vidrios y cerámicas, y luz indirecta suave a los interiores.
 */
function StudioEnvironment({ intensity = 0.55 }: { readonly intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = intensity;
    invalidate();
    return () => {
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, intensity, invalidate, scene]);
  return null;
}

export type LightingMode = 'day' | 'night';

interface SceneEnvironmentProps {
  readonly bounds: Box3 | null;
  /** Noche: sin sol y con poca luz ambiente; solo iluminan las luminarias. */
  readonly lighting?: LightingMode;
}

const LIGHTING: Record<
  LightingMode,
  {
    background: string;
    hemisphere: number;
    ambient: number;
    sun: number;
    env: number;
    grid: readonly [string, string];
  }
> = {
  day: {
    background: '#eef0f3',
    hemisphere: 0.75,
    ambient: 0.45,
    sun: 1.8,
    env: 0.55,
    grid: ['#cfd3da', '#a9afb9'],
  },
  night: {
    background: '#151a24',
    hemisphere: 0.06,
    ambient: 0.04,
    sun: 0,
    env: 0.05,
    grid: ['#232a37', '#2f3848'],
  },
};

const DEFAULT_CENTER = new Vector3(0, 0, 0);

/** Iluminación base, suelo de referencia y grilla métrica (celdas de 0,5 m, secciones de 1 m). */
export function SceneEnvironment({ bounds, lighting = 'day' }: SceneEnvironmentProps) {
  const look = LIGHTING[lighting];
  const target = useMemo(() => new Object3D(), []);
  const { center, radius } = useMemo(() => {
    if (!bounds) return { center: DEFAULT_CENTER, radius: 8 };
    const sphere = bounds.getBoundingSphere(new Sphere());
    return { center: sphere.center.clone().setY(0), radius: Math.max(sphere.radius, 4) };
  }, [bounds]);

  const lightPosition: [number, number, number] = [
    center.x + radius * 0.6,
    radius * 1.6 + 6,
    center.z + radius * 0.9,
  ];

  return (
    <>
      <color attach="background" args={[look.background]} />
      <StudioEnvironment intensity={look.env} />
      <hemisphereLight args={['#ffffff', '#b9b2a6', look.hemisphere]} />
      {/* Relleno para interiores: el cielo bloquea la luz direccional del sol. */}
      <ambientLight intensity={look.ambient} />
      <primitive object={target} position={[center.x, 0, center.z]} />
      <directionalLight
        position={lightPosition}
        target={target}
        intensity={look.sun}
        castShadow={look.sun > 0}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-radius * 1.3}
        shadow-camera-right={radius * 1.3}
        shadow-camera-top={radius * 1.3}
        shadow-camera-bottom={-radius * 1.3}
        shadow-camera-near={0.5}
        shadow-camera-far={radius * 6 + 20}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.004} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
      <Grid
        position-y={-0.002}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={look.grid[0]}
        sectionSize={1}
        sectionThickness={1}
        sectionColor={look.grid[1]}
        fadeDistance={90}
        fadeStrength={1.4}
      />
    </>
  );
}
