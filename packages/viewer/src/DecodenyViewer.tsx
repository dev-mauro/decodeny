import { findLevel, mmToMeters, type Project, type Vec2 } from '@decodeny/domain';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { PerspectiveCamera, type Box3 } from 'three';
import { DoorControls, type NearbyDoor } from './navigation/DoorControls';
import { DoorStoreContext } from './navigation/door-context';
import { createDoorStore } from './navigation/doors';
import { DEFAULT_PERSON, type PersonProfile } from './navigation/person-profile';
import { navigationModes } from './navigation/registry';
import { TouchControls, type TouchControlsLabels } from './navigation/TouchControls';
import { createVirtualInput } from './navigation/virtual-input';
import type { NavigationModeId } from './navigation/types';
import { resolveFinishes } from './materials/finish-materials';
import { levelWorldBounds } from './scene/content-bounds';
import { levelSlab, type LevelSlab } from './scene/slabs';
import { depthRange, rangeChanged } from './scene/depth-range';
import { StaticShadows } from './scene/StaticShadows';
import { prefersReducedMotion } from './scene/motion';
import type { SectionMode } from './scene/section-cutaway';
import { usePreventBrowserZoom } from './scene/use-prevent-browser-zoom';
import type { ViewerCameraApi } from './scene/EditCamera';
import { ContextLossGuard } from './scene/ContextLossGuard';
import { ViewerApiBridge, type ViewerApi } from './scene/ViewerApiBridge';
import type { ItemGroup } from './scene/item-groups';
import type { MeasurePoint } from './scene/measure';
import { LevelView } from './scene/LevelView';
import { PlacementPointer } from './scene/PlacementPointer';
import { CameraPoseReporter } from './scene/CameraPoseReporter';
import { PeerAvatars } from './scene/PeerAvatars';
import type { ViewerCameraPose, ViewerPeers } from './scene/peers';
import { SceneEnvironment, type LightingMode } from './scene/SceneEnvironment';
import type {
  ItemDragEvent,
  OpeningDragEvent,
  RoomDragEvent,
  SelectOptions,
  ViewerPlacement,
  ViewerSelection,
} from './selection';

export interface DecodenyViewerProps {
  readonly project: Project;
  readonly levelId: string;
  readonly selection: ViewerSelection | null;
  /**
   * Otras entidades seleccionadas junto con `selection` (selección múltiple): se dibujan como
   * seleccionadas y los muebles se arrastran juntos. La aplicación decide qué incluye.
   */
  readonly selectionGroup?: readonly ViewerSelection[];
  /** `options.additive`: el clic fue con Shift, Ctrl o Cmd (sumar o quitar de la selección). */
  readonly onSelectionChange: (selection: ViewerSelection | null, options?: SelectOptions) => void;
  /** Entidades a resaltar suavemente (p. ej. al pasar el mouse por un panel). */
  readonly highlighted?: readonly ViewerSelection[];
  /** Se invoca cuando cambia lo que está bajo el puntero en la vista. */
  readonly onHoverChange?: (target: ViewerSelection | null) => void;
  /**
   * Arrastre del recinto seleccionado. El visor solo informa el desplazamiento; la aplicación
   * decide el ajuste y ejecuta el comando. Sin este callback no se puede arrastrar.
   */
  readonly onRoomDrag?: (event: RoomDragEvent) => void;
  /** Arrastre del vano seleccionado a lo largo de su muro (mismo contrato que `onRoomDrag`). */
  readonly onOpeningDrag?: (event: OpeningDragEvent) => void;
  /** Arrastre del mueble seleccionado sobre el piso. */
  readonly onItemDrag?: (event: ItemDragEvent) => void;
  /**
   * Ubicación con el puntero (p. ej. un mueble nuevo). Mientras está activa no se selecciona
   * ni se resalta nada; solo en el modo de edición.
   */
  readonly placement?: ViewerPlacement | null;
  readonly cameraRef?: RefObject<ViewerCameraApi | null>;
  /** API general del visor (capturas). */
  readonly apiRef?: Ref<ViewerApi>;
  /** Modo de navegación (`edit`, `person`, `ghost` o uno registrado). */
  readonly navigationMode?: NavigationModeId;
  /** Se invoca cuando el recorrido captura o libera el mouse (Pointer Lock). */
  readonly onPointerLockChange?: (locked: boolean) => void;
  readonly personProfile?: PersonProfile;
  /** Punto de partida del recorrido (planta, mm), p. ej. elegido con un clic en el piso. */
  readonly walkStart?: Vec2 | null;
  /** Balanceo de cabeza al caminar; se ignora si el sistema pide reducir el movimiento. */
  readonly headBob?: boolean;
  /**
   * Controles táctiles en el recorrido y el vuelo (joystick y arrastrar para mirar), con sus
   * textos. La aplicación los activa en pantallas táctiles.
   */
  readonly touchControls?: TouchControlsLabels | null;
  /** Día (sol + cielo) o noche (solo luminarias). */
  readonly lighting?: LightingMode;
  /**
   * URL de una imagen del usuario por id de asset (cuadros). El visor no sabe dónde viven los
   * bytes: la aplicación los resuelve (IndexedDB, archivo `.zip`…).
   */
  readonly assetUrl?: (assetId: string) => string | undefined;
  /** Capas ocultas: muebles, decoración o luminarias. */
  readonly hiddenGroups?: ReadonlySet<ItemGroup>;
  /** Corte horizontal de muros (mm) para ver los interiores; solo en edición. */
  readonly sectionHeight?: number | null;
  /**
   * `all`: el corte recorta toda la envolvente. `facing`: solo los muros que tapan el interior
   * desde la cámara; los del fondo quedan enteros (la raíz expone los recortados en
   * `data-section-cut`).
   */
  readonly sectionMode?: SectionMode;
  /** Herramienta de medición: cada clic en la escena entrega un punto. */
  readonly onMeasurePoint?: (point: MeasurePoint) => void;
  readonly measurePoints?: readonly MeasurePoint[];
  /**
   * Muestra muros, pisos y cielos con su material real, sin el brillo de selección ni de
   * resaltado: la aplicación lo activa mientras el usuario edita una terminación, para que vea
   * el color exacto que está eligiendo.
   */
  readonly trueSurfaceColors?: boolean;
  /** Se invoca cuando el navegador restauró los gráficos tras perder el contexto WebGL. */
  readonly onGraphicsRestored?: () => void;
  /** Cuadrícula de trabajo sobre el suelo (paso en mm); `null` sin cuadrícula. */
  readonly grid?: { readonly step: number } | null;
  /** Otros participantes de una sesión colaborativa: se dibuja su cuerpo. */
  readonly peers?: ViewerPeers | null;
  /** Pose de la cámara cuando cambia (~12 por segundo como máximo), p. ej. para compartirla. */
  readonly onCameraPose?: (pose: ViewerCameraPose) => void;
  /**
   * Recorrido y vuelo: la puerta al alcance (para indicar cómo abrirla) o `null`. Se abre o
   * cierra con E (recorrido) o F, con un clic con el puntero capturado o con `ViewerApi.toggleDoor`.
   */
  readonly onNearbyDoor?: (door: NearbyDoor | null) => void;
  /**
   * El recorrido pasó a otra planta (la persona subió o bajó una escalera): la aplicación decide
   * si la activa. El visor no cambia `levelId` por su cuenta.
   */
  readonly onLevelChange?: (levelId: string) => void;
  /** Locale para formatear cotas (p. ej. `es`). */
  readonly locale?: string;
  readonly className?: string;
}

/** Avisa una vez, tras el primer cuadro dibujado con la escena montada. */
function FirstFrame({ onFrame }: { readonly onFrame: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onFrame();
  });
  return null;
}

/** Ajusta el campo de visión de la cámara según el modo. */
/** Ajusta `near`/`far` a la escena en cada cuadro (ver `depthRange`): sin parpadeos de lejos. */
function CameraDepth({ bounds }: { readonly bounds: Box3 | null }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const next = depthRange(camera.position, bounds);
    if (!rangeChanged(camera, next)) return;
    camera.near = next.near;
    camera.far = next.far;
    camera.updateProjectionMatrix();
  });
  return null;
}

function CameraFov({ fov }: { readonly fov: number }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (camera instanceof PerspectiveCamera && camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, fov, invalidate]);
  return null;
}

const ignoreSelection = () => undefined;

/** E también sube en el vuelo: ahí las puertas se abren con F. */
const WALK_DOOR_KEYS = ['KeyE', 'KeyF'] as const;
const FLY_DOOR_KEYS = ['KeyF'] as const;

/**
 * Visor 3D: proyección de solo lectura del documento. Nunca modifica el proyecto;
 * comunica intenciones (selección) mediante callbacks (ver ADR-003).
 */
export function DecodenyViewer({
  project,
  levelId,
  selection,
  selectionGroup,
  onSelectionChange,
  highlighted,
  onHoverChange,
  onRoomDrag,
  onOpeningDrag,
  onItemDrag,
  placement = null,
  cameraRef,
  apiRef,
  navigationMode = 'edit',
  onPointerLockChange,
  personProfile = DEFAULT_PERSON,
  walkStart = null,
  headBob = false,
  touchControls = null,
  lighting = 'day',
  assetUrl,
  hiddenGroups,
  sectionHeight = null,
  sectionMode = 'all',
  onMeasurePoint,
  measurePoints,
  trueSurfaceColors = false,
  onGraphicsRestored,
  grid = null,
  peers = null,
  onCameraPose,
  onNearbyDoor,
  onLevelChange,
  locale = 'es',
  className,
}: DecodenyViewerProps) {
  const level = findLevel(project, levelId);
  // Las demás plantas, para ver: en edición, las de abajo (las de arriba se ocultan, como una casa
  // de muñecas); en el recorrido y el vuelo, todas.
  const mode = navigationModes.get(navigationMode) ?? navigationModes.require('edit');
  const contextLevels = useMemo(
    () =>
      level
        ? project.levels.filter(
            (l) => l.id !== level.id && (!mode.interactive || l.elevation < level.elevation),
          )
        : [],
    [level, mode.interactive, project.levels],
  );
  // Huecos de escalera y losas entre plantas: dependen solo de las plantas.
  const slabs = useMemo(() => {
    const map = new Map<string, LevelSlab>();
    for (const l of project.levels) map.set(l.id, levelSlab(project.levels, l));
    return map;
  }, [project.levels]);
  const bounds = useMemo(() => {
    const boxes = [level, ...contextLevels].flatMap((l) => {
      const b = l ? levelWorldBounds(l) : null;
      return b ? [b] : [];
    });
    return boxes.length === 0 ? null : boxes.reduce((a, b) => a.clone().union(b));
  }, [contextLevels, level]);
  const finishes = useMemo(() => resolveFinishes(project.materials), [project.materials]);
  const autoFitted = useRef(false);
  // `data-ready` en la raíz: la escena ya se dibujó (útil para tests e integraciones).
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  usePreventBrowserZoom(rootRef);
  const Mode = mode.Component;
  const placing = mode.interactive && placement !== null;
  const [virtualInput] = useState(createVirtualInput);
  const interactive = mode.interactive && !placing;
  const [sectionCut, setSectionCut] = useState<readonly string[] | null>(null);
  // Puertas del recorrido: un estado nuevo (el del documento) cada vez que se entra a un modo.
  const doorSession = mode.interactive ? null : mode.id;
  const doorStore = useMemo(() => (doorSession ? createDoorStore() : null), [doorSession]);
  const toggleDoorRef = useRef<(() => boolean) | null>(null);

  return (
    <div
      ref={rootRef}
      className={className}
      data-testid="viewer"
      data-navigation-mode={mode.id}
      data-ready={ready || undefined}
      data-placing={placing || undefined}
      data-true-surface-colors={trueSurfaceColors || undefined}
      data-peers={peers && peers.list.length > 0 ? peers.list.length : undefined}
      data-section-cut={sectionCut?.join(' ')}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <Canvas
        shadows="percentage"
        frameloop={mode.frameloop}
        dpr={[1, 2]}
        camera={{ position: [9, 10, 13], fov: 45, near: 0.05, far: 2000 }}
        onPointerMissed={() => {
          if (interactive && !onMeasurePoint) onSelectionChange(null);
        }}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      >
        <DoorStoreContext.Provider value={doorStore}>
          <SceneEnvironment
            bounds={bounds}
            lighting={lighting}
            gridStep={grid?.step ?? null}
            gridElevation={level?.elevation ?? 0}
          />
          <FirstFrame onFrame={() => setReady(true)} />
          <ViewerApiBridge apiRef={apiRef} toggleDoorRef={toggleDoorRef} />
          <ContextLossGuard onRestored={onGraphicsRestored} />
          <CameraFov fov={mode.fov} />
          <CameraDepth bounds={bounds} />
          <StaticShadows
            keys={[level, contextLevels, lighting, mode.id, sectionHeight, hiddenGroups]}
          />
          {/* Una sola lista con la planta activa y las de contexto: al cambiar de planta en el
              recorrido, cada una conserva su componente (y sus geometrías). */}
          {project.levels.map((other) =>
            other.id === level?.id ? (
              <LevelView
                key={other.id}
                level={other}
                slab={slabs.get(other.id)}
                selection={selection}
                selectionGroup={selectionGroup}
                onSelect={onSelectionChange}
                locale={locale}
                interactive={interactive}
                highlighted={highlighted}
                onHoverChange={onHoverChange}
                onRoomDrag={onRoomDrag}
                onOpeningDrag={onOpeningDrag}
                onItemDrag={onItemDrag}
                finishes={finishes}
                assetUrl={assetUrl}
                hiddenGroups={hiddenGroups}
                sectionHeight={mode.interactive ? sectionHeight : null}
                sectionMode={sectionMode}
                onSectionCutChange={setSectionCut}
                onMeasurePoint={onMeasurePoint}
                measurePoints={measurePoints}
                trueSurfaceColors={trueSurfaceColors}
                lampShadows={lighting === 'night'}
              />
            ) : contextLevels.includes(other) ? (
              <LevelView
                key={other.id}
                level={other}
                slab={slabs.get(other.id)}
                selection={null}
                onSelect={ignoreSelection}
                locale={locale}
                interactive={false}
                finishes={finishes}
                assetUrl={assetUrl}
                hiddenGroups={hiddenGroups}
                context
              />
            ) : null,
          )}
          {placing && <PlacementPointer placement={placement} />}
          {level && peers && peers.list.length > 0 && (
            <PeerAvatars peers={peers} floorY={mmToMeters(level.elevation)} />
          )}
          {onCameraPose && <CameraPoseReporter onPose={onCameraPose} />}
          {level && (
            <Suspense fallback={null}>
              <Mode
                key={mode.id}
                level={level}
                levels={project.levels}
                slabs={slabs}
                onLevelChange={onLevelChange}
                bounds={bounds}
                selection={selection}
                profile={personProfile}
                cameraApiRef={cameraRef}
                autoFitted={autoFitted}
                onPointerLockChange={onPointerLockChange}
                walkStart={walkStart}
                headBob={headBob && !prefersReducedMotion()}
                virtualInput={virtualInput}
              />
            </Suspense>
          )}
          {level && doorStore && (
            <DoorControls
              level={level}
              store={doorStore}
              keys={mode.id === 'person' ? WALK_DOOR_KEYS : FLY_DOOR_KEYS}
              radiusMm={personProfile.radiusMm}
              onNearbyDoor={onNearbyDoor}
              toggleRef={toggleDoorRef}
            />
          )}
        </DoorStoreContext.Provider>
      </Canvas>
      {touchControls && !mode.interactive && (
        <TouchControls input={virtualInput} flying={mode.id === 'ghost'} labels={touchControls} />
      )}
    </div>
  );
}
