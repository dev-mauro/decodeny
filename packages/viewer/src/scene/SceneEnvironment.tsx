import { Grid } from '@react-three/drei';
import { FloorGrid } from './FloorGrid';
import { sunShadowFrame } from './sun-shadow';
import { setFloorGrid } from '../materials/finish-materials';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Box3, Object3D, PMREMGenerator, Vector3 } from 'three';
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
  /**
   * Cuadrícula de trabajo (paso en mm): se dibuja sobre los pisos, más marcada que la del suelo
   * decorativo, con líneas mayores cada metro. `null`: solo la del suelo, bajo los pisos.
   */
  readonly gridStep?: number | null;
  /** Altura del piso del nivel (mm), donde va la cuadrícula de trabajo. */
  readonly gridElevation?: number;
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
    workGrid: readonly [string, string];
  }
> = {
  day: {
    background: '#eef0f3',
    hemisphere: 0.5,
    ambient: 0.1,
    sun: 2.2,
    env: 0.9,
    grid: ['#cfd3da', '#a9afb9'],
    workGrid: ['#7d8794', '#4b5563'],
  },
  night: {
    background: '#151a24',
    hemisphere: 0.06,
    ambient: 0.04,
    sun: 0,
    env: 0.05,
    grid: ['#232a37', '#2f3848'],
    workGrid: ['#8b96a8', '#c3cad6'],
  },
};

/** Escena vacía: una caja de 6 × 6 m para encuadrar el sol igual. */
const EMPTY_BOUNDS = new Box3(new Vector3(-3, 0, -3), new Vector3(3, 2.4, 3));
/** Resolución del mapa de sombra del sol (encuadrado a la casa: texels de ~1 cm). */
const SUN_SHADOW_MAP = 2048;

/** Iluminación base, suelo de referencia y grilla métrica (celdas de 0,5 m, secciones de 1 m). */
export function SceneEnvironment({
  bounds,
  lighting = 'day',
  gridStep = null,
  gridElevation = 0,
}: SceneEnvironmentProps) {
  const look = LIGHTING[lighting];
  const invalidate = useThree((st) => st.invalidate);
  // La cuadrícula sobre los pisos va en su shader (ver `setFloorGrid`): mismo paso y origen.
  useEffect(() => {
    setFloorGrid(
      gridStep ? gridStep / 1000 : 0,
      gridStep && gridStep < 1000 ? Math.round(1000 / gridStep) : 5,
      look.workGrid[1],
    );
    invalidate();
  }, [gridStep, invalidate, look.workGrid]);
  const target = useMemo(() => new Object3D(), []);
  const sun = useMemo(() => sunShadowFrame(bounds ?? EMPTY_BOUNDS, SUN_SHADOW_MAP), [bounds]);

  return (
    <>
      <color attach="background" args={[look.background]} />
      <StudioEnvironment intensity={look.env} />
      <hemisphereLight args={['#ffffff', '#b9b2a6', look.hemisphere]} />
      {/* Relleno para interiores: el cielo bloquea la luz direccional del sol. */}
      <ambientLight intensity={look.ambient} />
      <primitive object={target} position={sun.target} />
      <directionalLight
        position={sun.position}
        target={target}
        intensity={look.sun}
        castShadow={look.sun > 0}
        shadow-mapSize={[SUN_SHADOW_MAP, SUN_SHADOW_MAP]}
        shadow-bias={sun.bias}
        shadow-normalBias={sun.normalBias}
        shadow-radius={3}
        shadow-camera-left={sun.left}
        shadow-camera-right={sun.right}
        shadow-camera-top={sun.top}
        shadow-camera-bottom={sun.bottom}
        shadow-camera-near={sun.near}
        shadow-camera-far={sun.far}
      />
      {/* Bajo los pisos con holgura (antes −4 mm: "peleaba" con ellos de lejos). */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial opacity={0.12} />
      </mesh>
      {gridStep ? (
        <FloorGrid
          bounds={bounds}
          stepMm={gridStep}
          elevationMm={gridElevation}
          colors={look.workGrid}
        />
      ) : (
        <Grid
          position-y={-0.01}
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
      )}
    </>
  );
}
