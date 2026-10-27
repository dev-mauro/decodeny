import { findLevel, type Project, type Vec2 } from '@decodeny/domain';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type Ref, type RefObject } from 'react';
import { PerspectiveCamera } from 'three';
import { DEFAULT_PERSON, type PersonProfile } from './navigation/person-profile';
import { navigationModes } from './navigation/registry';
import { TouchControls, type TouchControlsLabels } from './navigation/TouchControls';
import { createVirtualInput } from './navigation/virtual-input';
import type { NavigationModeId } from './navigation/types';
import { resolveFinishes } from './materials/finish-materials';
import { levelWorldBounds } from './scene/content-bounds';
import { prefersReducedMotion } from './scene/motion';
import type { ViewerCameraApi } from './scene/EditCamera';
import { ContextLossGuard } from './scene/ContextLossGuard';
import { ViewerApiBridge, type ViewerApi } from './scene/ViewerApiBridge';
import type { ItemGroup } from './scene/item-groups';
import type { MeasurePoint } from './scene/measure';
import { LevelView } from './scene/LevelView';
import { PlacementPointer } from './scene/PlacementPointer';
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
  onMeasurePoint,
  measurePoints,
  trueSurfaceColors = false,
  onGraphicsRestored,
  locale = 'es',
  className,
}: DecodenyViewerProps) {
  const level = findLevel(project, levelId);
  const bounds = useMemo(() => (level ? levelWorldBounds(level) : null), [level]);
  const finishes = useMemo(() => resolveFinishes(project.materials), [project.materials]);
  const autoFitted = useRef(false);
  // `data-ready` en la raíz: la escena ya se dibujó (útil para tests e integraciones).
  const [ready, setReady] = useState(false);
  const mode = navigationModes.get(navigationMode) ?? navigationModes.require('edit');
  const Mode = mode.Component;
  const placing = mode.interactive && placement !== null;
  const [virtualInput] = useState(createVirtualInput);
  const interactive = mode.interactive && !placing;

  return (
    <div
      className={className}
      data-testid="viewer"
      data-navigation-mode={mode.id}
      data-ready={ready || undefined}
      data-placing={placing || undefined}
      data-true-surface-colors={trueSurfaceColors || undefined}
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
        <SceneEnvironment bounds={bounds} lighting={lighting} />
        <FirstFrame onFrame={() => setReady(true)} />
        <ViewerApiBridge apiRef={apiRef} />
        <ContextLossGuard onRestored={onGraphicsRestored} />
        <CameraFov fov={mode.fov} />
        {level && (
          <LevelView
            level={level}
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
            onMeasurePoint={onMeasurePoint}
            measurePoints={measurePoints}
            trueSurfaceColors={trueSurfaceColors}
            lampShadows={lighting === 'night'}
          />
        )}
        {placing && <PlacementPointer placement={placement} />}
        {level && (
          <Suspense fallback={null}>
            <Mode
              key={mode.id}
              level={level}
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
      </Canvas>
      {touchControls && !mode.interactive && (
        <TouchControls input={virtualInput} flying={mode.id === 'ghost'} labels={touchControls} />
      )}
    </div>
  );
}
