import {
  findLevel,
  type Item,
  type Level,
  type Params,
  type Project,
  type Vec2,
} from '@decodeny/domain';
import type {
  BuiltInNavigationMode,
  ItemGroup,
  MeasurePoint,
  PlanTool,
  ViewerSelection,
} from '@decodeny/viewer';
import { create } from 'zustand';
import { useProjectStore } from './project-store';
import { nextSelection, pruneSelection, selectMany } from './selection-model';

/**
 * Item nuevo que el usuario está ubicando con el puntero. El item existe como vista previa del
 * documento (transacción abierta) hasta que se confirma o se cancela; ver `placement.ts`.
 */
export interface ItemPlacementSession {
  readonly itemId: string;
  readonly def: string;
  readonly params: Params;
  /** Giro elegido por el usuario (R); los de muro lo ajustan al muro. */
  readonly rotation: number;
  /** Altura sobre el piso de los items cuyo montaje no la determina (p. ej. un cuadro). */
  readonly z: number;
  /** Altura (mm) del plano donde la vista 3D proyecta el puntero. */
  readonly pointerHeight: number;
  /** Último punto del puntero (planta, mm) y si se ajustaba; `null` antes de moverlo. */
  readonly pointer: { readonly point: Vec2; readonly snap: boolean } | null;
}

/** Panel abierto como hoja en el layout móvil. */
export type MobilePanel = 'rooms' | 'catalog' | 'inspector' | null;

/** Estado de interfaz (no forma parte del documento ni del historial). */
interface UiState {
  readonly levelId: string | null;
  /** Selección principal (la del inspector); ver `selection-model.ts`. */
  readonly selection: ViewerSelection | null;
  /** Otras entidades seleccionadas junto con la principal (selección múltiple de muebles). */
  readonly selectionGroup: readonly ViewerSelection[];
  readonly createRoomOpen: boolean;
  readonly navigationMode: BuiltInNavigationMode;
  /** El recorrido tiene capturado el mouse (Pointer Lock). */
  readonly pointerLocked: boolean;
  /** Lo que está bajo el puntero en la vista 3D (para resaltar su fila en los paneles). */
  readonly viewportHover: ViewerSelection | null;
  /** Lo que se resalta en la vista 3D desde los paneles (o el ajuste al arrastrar). */
  readonly highlighted: readonly ViewerSelection[];
  /** Pestaña del panel izquierdo. */
  readonly leftTab: 'rooms' | 'catalog';
  /** Muebles copiados (Ctrl+C), con sus datos completos para pegarlos en cualquier proyecto. */
  readonly clipboard: readonly Item[];
  /** Instancia de material copiada con el cuentagotas. */
  readonly finishClipboard: string | null;
  /** Iluminación de la vista: día (sol) o noche (solo luminarias). */
  readonly lighting: 'day' | 'night';
  /** Capas ocultas de la vista. */
  readonly hiddenGroups: ReadonlySet<ItemGroup>;
  /** Corte de muros a esta altura (mm) para ver los interiores; `null` sin corte. */
  readonly sectionHeight: number | null;
  /** Herramienta de medición activa y sus puntos (a lo sumo dos). */
  readonly measuring: boolean;
  readonly measurePoints: readonly MeasurePoint[];
  /** Vista principal: 3D o planta 2D. */
  readonly view: '3d' | 'plan';
  /** Herramienta de la planta 2D. */
  readonly planTool: PlanTool;
  /**
   * Editores de terminación en uso (puntero encima o foco dentro). Mientras haya alguno, la
   * vista muestra las superficies con su color real, sin el brillo de selección.
   */
  readonly finishEditors: number;
  readonly placement: ItemPlacementSession | null;
  /** Eligiendo con un clic en el piso dónde empieza el recorrido. */
  readonly pickingWalkStart: boolean;
  /** Punto de partida del recorrido en curso (planta, mm); `null`: el automático. */
  readonly walkStart: Vec2 | null;
  /** Balanceo de cabeza al caminar (preferencia del usuario, se recuerda). */
  readonly headBob: boolean;
  /** Layout móvil: panel abierto sobre la vista. */
  readonly mobilePanel: MobilePanel;
  /** `additive` (Shift, Ctrl o Cmd): suma o quita de la selección en vez de reemplazarla. */
  readonly select: (selection: ViewerSelection | null, options?: { additive?: boolean }) => void;
  readonly selectMany: (targets: readonly ViewerSelection[], additive?: boolean) => void;
  readonly setCreateRoomOpen: (open: boolean) => void;
  readonly setNavigationMode: (mode: BuiltInNavigationMode) => void;
  readonly setPointerLocked: (locked: boolean) => void;
  readonly setViewportHover: (target: ViewerSelection | null) => void;
  readonly setHighlighted: (targets: readonly ViewerSelection[]) => void;
  readonly setLeftTab: (tab: 'rooms' | 'catalog') => void;
  readonly setClipboard: (items: readonly Item[]) => void;
  readonly setFinishClipboard: (materialId: string | null) => void;
  readonly setLighting: (lighting: 'day' | 'night') => void;
  readonly toggleGroup: (group: ItemGroup) => void;
  readonly setSectionHeight: (height: number | null) => void;
  readonly setMeasuring: (measuring: boolean) => void;
  readonly addMeasurePoint: (point: MeasurePoint) => void;
  readonly setView: (view: '3d' | 'plan') => void;
  readonly setPlanTool: (tool: PlanTool) => void;
  /** Marca un editor de terminación como en uso; devuelve la función que lo libera. */
  readonly holdFinishEditor: () => () => void;
  readonly setPlacement: (placement: ItemPlacementSession | null) => void;
  readonly setPickingWalkStart: (picking: boolean) => void;
  /** Empieza el recorrido en `point`. */
  readonly walkFrom: (point: Vec2) => void;
  readonly setHeadBob: (headBob: boolean) => void;
  readonly setMobilePanel: (panel: MobilePanel) => void;
}

const HEAD_BOB_KEY = 'decodeny.headBob';

/** Balanceo de cabeza recordado (apagado por defecto: puede marear). */
function readHeadBob(): boolean {
  try {
    return localStorage.getItem(HEAD_BOB_KEY) === '1';
  } catch {
    return false;
  }
}

/** Altura de corte por defecto: sobre muebles bajos, bajo dinteles y ventanas altas. */
export const DEFAULT_SECTION_HEIGHT = 1200;

const NONE: readonly ViewerSelection[] = [];

export const useUiStore = create<UiState>()((set) => ({
  levelId: null,
  selection: null,
  selectionGroup: [],
  createRoomOpen: false,
  navigationMode: 'edit',
  pointerLocked: false,
  viewportHover: null,
  highlighted: NONE,
  leftTab: 'rooms',
  clipboard: [],
  finishClipboard: null,
  lighting: 'day',
  hiddenGroups: new Set(),
  sectionHeight: null,
  measuring: false,
  measurePoints: [],
  view: '3d',
  planTool: 'select',
  finishEditors: 0,
  placement: null,
  pickingWalkStart: false,
  walkStart: null,
  headBob: readHeadBob(),
  mobilePanel: null,
  select: (target, options) => set((s) => nextSelection(s, target, options?.additive)),
  selectMany: (targets, additive) => set((s) => selectMany(s, targets, additive)),
  setCreateRoomOpen: (createRoomOpen) => set({ createRoomOpen }),
  // Recorrer o volar implica la vista 3D.
  // El punto de partida elegido vale para un recorrido: al salir, vuelve el automático.
  setNavigationMode: (navigationMode) =>
    set((s) => ({
      navigationMode,
      pointerLocked: false,
      measuring: false,
      measurePoints: [],
      pickingWalkStart: false,
      walkStart: navigationMode === 'person' ? s.walkStart : null,
      ...(navigationMode === 'edit' ? {} : { view: '3d' as const, planTool: 'select' as const }),
    })),
  setPickingWalkStart: (pickingWalkStart) =>
    set(
      pickingWalkStart
        ? {
            pickingWalkStart,
            measuring: false,
            measurePoints: [],
            planTool: 'select',
            mobilePanel: null,
          }
        : { pickingWalkStart },
    ),
  walkFrom: (point) =>
    set({
      walkStart: point,
      pickingWalkStart: false,
      navigationMode: 'person',
      pointerLocked: false,
      measuring: false,
      measurePoints: [],
      view: '3d',
      planTool: 'select',
    }),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setHeadBob: (headBob) => {
    try {
      localStorage.setItem(HEAD_BOB_KEY, headBob ? '1' : '0');
    } catch {
      // Preferencia no persistida: vale para esta sesión.
    }
    set({ headBob });
  },
  // La medición sigue activa al cambiar de vista; sus puntos no (la planta mide sin altura).
  setView: (view) =>
    set(
      view === 'plan'
        ? { view, navigationMode: 'edit', measurePoints: [] }
        : { view, planTool: 'select', measurePoints: [] },
    ),
  // Dibujar muros es una herramienta de la planta.
  setPlanTool: (planTool) =>
    set(
      planTool === 'wall'
        ? {
            planTool,
            view: 'plan',
            navigationMode: 'edit',
            measuring: false,
            measurePoints: [],
            mobilePanel: null,
          }
        : { planTool },
    ),
  holdFinishEditor: () => {
    set((s) => ({ finishEditors: s.finishEditors + 1 }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((s) => ({ finishEditors: s.finishEditors - 1 }));
    };
  },
  setPlacement: (placement) => set({ placement }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setViewportHover: (viewportHover) => set({ viewportHover }),
  setHighlighted: (targets) => set({ highlighted: targets.length === 0 ? NONE : targets }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setClipboard: (clipboard) => set({ clipboard }),
  setFinishClipboard: (finishClipboard) => set({ finishClipboard }),
  setLighting: (lighting) => set({ lighting }),
  toggleGroup: (group) =>
    set((s) => {
      const next = new Set(s.hiddenGroups);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return { hiddenGroups: next };
    }),
  setSectionHeight: (sectionHeight) => set({ sectionHeight }),
  // Medir y dibujar muros son herramientas excluyentes.
  setMeasuring: (measuring) =>
    set(
      measuring
        ? { measuring, measurePoints: [], planTool: 'select', mobilePanel: null }
        : { measuring, measurePoints: [] },
    ),
  // El tercer punto empieza una medición nueva.
  addMeasurePoint: (point) =>
    set((s) => ({
      measurePoints: s.measurePoints.length >= 2 ? [point] : [...s.measurePoints, point],
    })),
}));

export function activeLevel(project: Project, levelId: string | null): Level {
  return (levelId ? findLevel(project, levelId) : undefined) ?? project.levels[0]!;
}

export function useActiveLevel(): Level {
  const project = useProjectStore((s) => s.project);
  const levelId = useUiStore((s) => s.levelId);
  return activeLevel(project, levelId);
}

/** ¿La selección apunta a algo que existe en el nivel? (puede desaparecer tras deshacer). */
export function isSelectionValid(level: Level, selection: ViewerSelection | null): boolean {
  if (!selection) return true;
  switch (selection.kind) {
    case 'room':
      return level.rooms.some((r) => r.id === selection.id);
    case 'wall':
      return level.walls.some((w) => w.id === selection.id);
    case 'opening':
      return level.openings.some((o) => o.id === selection.id);
    case 'item':
      return level.items.some((i) => i.id === selection.id);
  }
}

// Limpia la selección cuando su entidad deja de existir (eliminar, deshacer, abrir otro archivo).
// La ubicación en curso vive en la transacción: si otra acción la cierra, la ubicación termina.
useProjectStore.subscribe((state) => {
  const ui = useUiStore.getState();
  const level = activeLevel(state.project, ui.levelId);
  const pruned = pruneSelection(ui, (target) => isSelectionValid(level, target));
  if (pruned !== ui) useUiStore.setState(pruned);
  const { placement } = ui;
  if (placement && !state.transaction) useUiStore.setState({ placement: null });
});
