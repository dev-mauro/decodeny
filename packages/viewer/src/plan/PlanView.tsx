import { itemEnvelope, resolveItemDefinition, resolveOpeningDefinition } from '@decodeny/catalog';
import {
  add,
  distance,
  dot,
  findLevel,
  FLAT_ITEM_HEIGHT,
  formatArea,
  formatLength,
  interiorPoint,
  isCounterClockwise,
  itemFootprint,
  levelBounds,
  levelWallFootprints,
  lerp,
  localize,
  normalize,
  openingEnvelope,
  parseLength,
  perpLeft,
  resolveParams,
  roomInteriorPolygon,
  roomMetrics,
  roomOnWallFace,
  roomSides,
  roomsOfWall,
  scale,
  snapDrawPoint,
  sub,
  type DrawSnap,
  type Level,
  type Project,
  type Vec2,
  type WallFootprint,
} from '@decodeny/domain';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { itemGroupOf, type ItemGroup } from '../scene/item-groups';
import { clipToSlab } from '../scene/section-geometry';
import { isAdditiveClick } from '../scene/interaction';
import type { ViewerApi } from '../scene/ViewerApiBridge';
import {
  interactionState,
  sameSelection,
  type AreaSelectEvent,
  type InteractionState,
  type ItemDragEvent,
  type OpeningDragEvent,
  type RoomDragEvent,
  type SelectOptions,
  type ViewerPlacement,
  type ViewerSelection,
} from '../selection';

/** Arrastre de un vértice (nodo) del eje de muros en la planta. */
export interface NodeDragEvent {
  readonly phase: 'move' | 'end' | 'cancel';
  readonly nodeId: string;
  /** Posición propuesta (mm de planta). */
  readonly position: Vec2;
  readonly snap: boolean;
}

/** Herramienta activa de la planta: seleccionar/mover o dibujar muros. */
export type PlanTool = 'select' | 'wall';

export interface PlanViewProps {
  readonly project: Project;
  readonly levelId: string;
  readonly selection: ViewerSelection | null;
  /** Otras entidades seleccionadas junto con `selection` (mismo contrato que la vista 3D). */
  readonly selectionGroup?: readonly ViewerSelection[];
  readonly onSelectionChange: (selection: ViewerSelection | null, options?: SelectOptions) => void;
  /** Shift + arrastrar sobre el fondo dibuja un recuadro de selección. */
  readonly onAreaSelect?: (event: AreaSelectEvent) => void;
  readonly highlighted?: readonly ViewerSelection[];
  readonly onHoverChange?: (target: ViewerSelection | null) => void;
  readonly onRoomDrag?: (event: RoomDragEvent) => void;
  readonly onItemDrag?: (event: ItemDragEvent) => void;
  readonly onOpeningDrag?: (event: OpeningDragEvent) => void;
  readonly onNodeDrag?: (event: NodeDragEvent) => void;
  readonly tool?: PlanTool;
  /** Espesor con que se previsualiza el muro que se dibuja (mm). */
  readonly wallThickness?: number;
  /** Se dibujó un tramo de muro (eje, mm de planta). */
  readonly onWallDraw?: (from: Vec2, to: Vec2) => void;
  /** Esc sin nada en curso: salir de la herramienta. */
  readonly onToolExit?: () => void;
  /** Ubicación con el puntero (mismo contrato que en la vista 3D; la altura no aplica). */
  readonly placement?: ViewerPlacement | null;
  readonly hiddenGroups?: ReadonlySet<ItemGroup>;
  readonly apiRef?: Ref<ViewerApi>;
  readonly locale?: string;
}

interface ViewState {
  /** Centro de la vista en planta (mm). */
  readonly cx: number;
  readonly cy: number;
  /** Píxeles por mm. */
  readonly s: number;
}

const COLORS = {
  background: '#f8fafc',
  room: { normal: '#ffffff', hover: '#eff6ff', selected: '#dbeafe' },
  wall: { normal: '#334155', hover: '#3b5b8f', selected: '#2563eb' },
  item: { normal: '#f1f5f9', hover: '#e0ecff', selected: '#bfdbfe' },
  itemStroke: { normal: '#94a3b8', hover: '#60a5fa', selected: '#2563eb' },
  opening: { normal: '#475569', hover: '#3b82f6', selected: '#2563eb' },
  dimension: '#2563eb',
  text: '#0f172a',
  muted: '#64748b',
} as const;

const DRAG_TOLERANCE_PX = 4;
/** Radio de captura al dibujar muros (px de pantalla). */
const DRAW_SNAP_PX = 10;
const MIN_DRAWN_WALL = 10;

const SNAP_COLORS: Record<DrawSnap['kind'], string> = {
  node: '#16a34a',
  wall: '#d97706',
  angle: '#2563eb',
  grid: '#64748b',
  free: '#64748b',
};

interface DrawState {
  /** Punto donde empieza el próximo tramo; `null` si no hay cadena en curso. */
  readonly from: Vec2 | null;
  readonly cursor: DrawSnap | null;
  /** Largo escrito con el teclado (p. ej. "3,5"), se confirma con Enter. */
  readonly typed: string;
}

const NO_DRAW: DrawState = { from: null, cursor: null, typed: '' };
const NO_GROUP: readonly ViewerSelection[] = [];

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
const pts = (points: readonly Vec2[]) => points.map((p) => `${p.x},${-p.y}`).join(' ');

/** Tramos sólidos de un muro en planta: sin ningún vano (se dibujan como huecos). */
function wallPieces(level: Level, fp: WallFootprint, wallId: string): Vec2[][] {
  const holes = level.openings
    .filter((o) => o.wallId === wallId)
    .map((o) => {
      const { width } = openingEnvelope(o);
      return [o.offset - width / 2, o.offset + width / 2] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const pieces: Vec2[][] = [];
  let cursor = -Infinity;
  for (const [a, b] of [...holes, [Infinity, Infinity] as const]) {
    if (a > cursor) {
      const piece = clipToSlab(fp.polygon, fp.start, fp.dir, cursor, a);
      if (piece.length >= 3) pieces.push(piece);
    }
    cursor = Math.max(cursor, b);
  }
  return pieces;
}

/**
 * Planta 2D del nivel (SVG): recintos con nombre y superficie, muros con sus vanos, símbolos de
 * apertura, muebles y cotas del recinto seleccionado. Comparte selección, hover y arrastres con
 * la vista 3D; además permite mover los vértices de un recinto. Rueda: zoom; arrastrar el fondo:
 * desplazar.
 */
export function PlanView({
  project,
  levelId,
  selection,
  selectionGroup = NO_GROUP,
  onSelectionChange,
  onAreaSelect,
  highlighted = [],
  onHoverChange,
  onRoomDrag,
  onItemDrag,
  onOpeningDrag,
  onNodeDrag,
  tool = 'select',
  wallThickness = 150,
  onWallDraw,
  onToolExit,
  placement = null,
  hiddenGroups,
  apiRef,
  locale = 'es',
}: PlanViewProps) {
  const level = findLevel(project, levelId);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<ViewState | null>(null);
  const [hovered, setHovered] = useState<ViewerSelection | null>(null);
  const [draw, setDraw] = useState<DrawState>(NO_DRAW);
  /** Recuadro de selección en curso (esquinas en mm de planta). */
  const [area, setArea] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const placing = placement !== null;
  const drawing = tool === 'wall' && !placing;
  // Al dibujar o ubicar, las entidades no capturan el puntero: todo clic es para la herramienta.
  const capturing = drawing || placing;
  // La cadena en curso se descarta al cambiar de herramienta o de nivel.
  const drawKey = `${tool}|${levelId}`;
  const [drawFor, setDrawFor] = useState(drawKey);
  if (drawFor !== drawKey) {
    setDrawFor(drawKey);
    setDraw(NO_DRAW);
  }

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback((): ViewState => {
    const b = level ? levelBounds(level) : null;
    if (!b) return { cx: 0, cy: 0, s: 0.08 };
    const margin = 1200;
    const s = Math.min(
      size.w / (b.max.x - b.min.x + 2 * margin),
      size.h / (b.max.y - b.min.y + 2 * margin),
    );
    return { cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, s };
  }, [level, size.h, size.w]);
  const current = view ?? fit();

  const data = useMemo(() => {
    if (!level) return null;
    const footprints = levelWallFootprints(level);
    return {
      footprints,
      rooms: level.rooms.map((room) => {
        const interior = roomInteriorPolygon(level, room);
        return {
          room,
          interior,
          sides: roomSides(level, room),
          label: interiorPoint(interior, 16),
          area: roomMetrics(level, room).area,
        };
      }),
      walls: level.walls.flatMap((wall) => {
        const fp = footprints.get(wall.id);
        return fp ? [{ wall, pieces: wallPieces(level, fp, wall.id) }] : [];
      }),
      openings: level.openings.flatMap((opening) => {
        const fp = footprints.get(opening.wallId);
        if (!fp) return [];
        const definition = resolveOpeningDefinition(opening.def);
        const params = resolveParams(definition.params, opening.params);
        const local = (x: number, z: number) =>
          add(add(fp.start, scale(fp.dir, opening.offset + x)), scale(perpLeft(fp.dir), z));
        const { width } = openingEnvelope(opening);
        const strokes = (definition.plan?.(params, { wallThickness: fp.thickness }) ?? []).map(
          (stroke) => ({
            dashed: stroke.dashed ?? false,
            points: stroke.points.map(([x, z]) => local(x, z)),
          }),
        );
        // Jambas: líneas a través del espesor en ambos extremos del vano.
        const half = fp.thickness / 2;
        const jambs = [-width / 2, width / 2].map((x) => [local(x, -half), local(x, half)]);
        return [{ opening, fp, strokes, jambs }];
      }),
      // Orden de dibujo por capas: lo plano (alfombras) abajo, lo que se apoya sobre otros
      // muebles arriba y lo que cuelga del cielo al final; así nada tapa al mueble de debajo.
      items: level.items
        .flatMap((item) => {
          const definition = resolveItemDefinition(item.def);
          if (hiddenGroups?.has(itemGroupOf(definition.category))) return [];
          const env = itemEnvelope(item);
          const layer =
            env.height <= FLAT_ITEM_HEIGHT
              ? 0
              : definition.mount === 'surface'
                ? 2
                : definition.mount === 'ceiling'
                  ? 3
                  : 1;
          const footprint = itemFootprint(item, env);
          const front = lerp(footprint[0]!, footprint[1]!, 0.5);
          return [
            {
              item,
              footprint,
              front,
              name: localize(definition.name, locale),
              mount: definition.mount,
              layer,
            },
          ];
        })
        .sort((a, b) => a.layer - b.layer),
    };
  }, [hiddenGroups, level, locale]);

  const stateOf = (target: ViewerSelection): InteractionState =>
    interactionState(target, selection, hovered, highlighted, selectionGroup);
  const hover = (target: ViewerSelection | null) => {
    if (sameSelection(hovered, target)) return;
    setHovered(target);
    onHoverChange?.(target);
  };

  // --- Coordenadas ---------------------------------------------------------------------------
  const toPlan = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: current.cx + (clientX - rect.left - rect.width / 2) / current.s,
        y: current.cy - (clientY - rect.top - rect.height / 2) / current.s,
      };
    },
    [current],
  );

  // --- Arrastres (fondo: desplazar; seleccionado: mover) -----------------------------------
  const drag = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    startPlan: Vec2;
    moved: boolean;
    kind: 'pan' | 'area' | 'room' | 'item' | 'opening' | 'node';
    id: string;
    /** Recuadro empezado sobre una entidad: si no hay arrastre, es un clic aditivo sobre ella. */
    clickTarget?: ViewerSelection;
    dir?: Vec2;
    origin?: Vec2;
    startView: ViewState;
  } | null>(null);

  const begin = (
    e: ReactPointerEvent,
    kind: NonNullable<typeof drag.current>['kind'],
    id = '',
    extra: { dir?: Vec2; origin?: Vec2; clickTarget?: ViewerSelection } = {},
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      startPlan: toPlan(e.clientX, e.clientY),
      moved: false,
      kind,
      id,
      startView: current,
      ...extra,
    };
  };

  const emit = (
    phase: 'move' | 'end' | 'cancel',
    e: { clientX: number; clientY: number; altKey: boolean },
  ) => {
    const d = drag.current;
    if (!d) return;
    const p = toPlan(e.clientX, e.clientY);
    const delta = sub(p, d.startPlan);
    const snap = !e.altKey;
    if (d.kind === 'room') onRoomDrag?.({ phase, roomId: d.id, delta, snap });
    else if (d.kind === 'item') onItemDrag?.({ phase, itemId: d.id, delta, snap });
    else if (d.kind === 'opening' && d.dir) {
      onOpeningDrag?.({ phase, openingId: d.id, along: dot(delta, d.dir), snap });
    } else if (d.kind === 'node' && d.origin) {
      onNodeDrag?.({ phase, nodeId: d.id, position: add(d.origin, delta), snap });
    }
  };

  // --- Dibujo de muros -----------------------------------------------------------------------
  const snapAt = (clientX: number, clientY: number, free: boolean): DrawSnap | null =>
    level
      ? snapDrawPoint(level, toPlan(clientX, clientY), draw.from, DRAW_SNAP_PX / current.s, free)
      : null;

  /** Agrega el punto: el primero empieza la cadena; los siguientes dibujan un tramo. */
  const placePoint = (to: DrawSnap) => {
    const from = draw.from;
    // Fija el encuadre: si no, se reajustaría a cada muro nuevo y el dibujo "saltaría".
    if (!view) setView(current);
    if (!from) {
      setDraw({ from: to.point, cursor: to, typed: '' });
      return;
    }
    if (distance(from, to.point) < MIN_DRAWN_WALL) return;
    onWallDraw?.(from, to.point);
    // Al llegar a un muro o nodo existente (p. ej. cerrar el contorno), la cadena termina.
    const ends = to.kind === 'node' || to.kind === 'wall';
    setDraw({ from: ends ? null : to.point, cursor: to, typed: '' });
  };

  /** Extremo del tramo según el largo escrito, en la dirección del cursor. */
  const typedEnd = (state: DrawState): Vec2 | null => {
    if (!state.from || state.typed === '') return null;
    const parsed = parseLength(state.typed);
    if (!parsed.ok || parsed.value < MIN_DRAWN_WALL) return null;
    const toward = state.cursor ? sub(state.cursor.point, state.from) : { x: 1, y: 0 };
    const dir = Math.hypot(toward.x, toward.y) > 0 ? normalize(toward) : { x: 1, y: 0 };
    const p = add(state.from, scale(dir, parsed.value));
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (placing && !d?.moved && e.buttons === 0) {
      placement.onEvent({ phase: 'move', point: toPlan(e.clientX, e.clientY), snap: !e.altKey });
    }
    if (drawing && !d?.moved) {
      const cursor = snapAt(e.clientX, e.clientY, e.altKey);
      setDraw((prev) => ({ ...prev, cursor }));
    }
    if (d?.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < DRAG_TOLERANCE_PX) {
      return;
    }
    d.moved = true;
    if (d.kind === 'area') {
      setArea({ a: d.startPlan, b: toPlan(e.clientX, e.clientY) });
    } else if (d.kind === 'pan') {
      setView({
        ...d.startView,
        cx: d.startView.cx - (e.clientX - d.start.x) / d.startView.s,
        cy: d.startView.cy + (e.clientY - d.start.y) / d.startView.s,
      });
    } else {
      emit('move', e);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.kind === 'area') {
      setArea(null);
      if (!d.moved) {
        if (d.clickTarget) onSelectionChange(d.clickTarget, { additive: true });
        return;
      }
      const b = toPlan(e.clientX, e.clientY);
      const a = d.startPlan;
      onAreaSelect?.({
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
        additive: true,
      });
      return;
    }
    if (d.moved && d.kind !== 'pan') emit('end', e);
    // Clic sin arrastre sobre un mueble de una selección múltiple: queda seleccionado solo él.
    if (!d.moved && d.kind === 'item' && selectionGroup.length > 0) {
      onSelectionChange({ kind: 'item', id: d.id });
    }
    if (!d.moved && d.kind === 'pan') {
      if (placing) {
        placement.onEvent({ phase: 'end', point: toPlan(e.clientX, e.clientY), snap: !e.altKey });
      } else if (drawing) {
        const snap = snapAt(e.clientX, e.clientY, e.altKey);
        if (snap) placePoint(snap);
      } else onSelectionChange(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag.current?.moved || drag.current.kind === 'pan') return;
      e.stopPropagation();
      setArea(null);
      emit('cancel', {
        clientX: drag.current.start.x,
        clientY: drag.current.start.y,
        altKey: false,
      });
      drag.current = null;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Teclado al dibujar: largo + Enter, Retroceso, Esc (borra el largo / termina la cadena / sale).
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey) return;
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (draw.from && /^[0-9.,]$/.test(e.key)) {
        consume();
        setDraw((prev) => ({ ...prev, typed: prev.typed + e.key }));
      } else if (draw.typed !== '' && /^[cm ]$/i.test(e.key)) {
        consume();
        setDraw((prev) => ({ ...prev, typed: prev.typed + e.key.toLowerCase() }));
      } else if (e.key === 'Backspace' && draw.typed !== '') {
        consume();
        setDraw((prev) => ({ ...prev, typed: prev.typed.slice(0, -1) }));
      } else if (e.key === 'Enter' && draw.typed !== '') {
        consume();
        const end = typedEnd(draw);
        if (!end || !level) return;
        placePoint(snapDrawPoint(level, end, null, 2));
      } else if (e.key === 'Escape') {
        if (drag.current?.moved) return;
        consume();
        if (draw.typed !== '') setDraw((prev) => ({ ...prev, typed: '' }));
        else if (draw.from) setDraw((prev) => ({ ...prev, from: null }));
        else onToolExit?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const onWheel = (e: ReactWheelEvent) => {
    const factor = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(2, Math.max(0.005, current.s * factor));
    // Zoom hacia el cursor: el punto bajo el puntero no se mueve.
    const p = toPlan(e.clientX, e.clientY);
    setView({
      s,
      cx: p.x - (p.x - current.cx) * (current.s / s),
      cy: p.y - (p.y - current.cy) * (current.s / s),
    });
  };

  /** Clic (sin arrastre) sobre una entidad: selección; si está seleccionada, puede arrastrarse. */
  const pick = (
    target: ViewerSelection,
    e: ReactPointerEvent,
    kind?: 'room' | 'item' | 'opening',
    extra: { dir?: Vec2 } = {},
  ) => {
    if (e.button !== 0) return;
    // Con Shift, Ctrl o Cmd suma o quita de la selección (la aplicación decide).
    // Desde algo que no es un mueble (los recintos cubren el fondo), arrastrar dibuja un recuadro.
    if (isAdditiveClick(e)) {
      if (target.kind !== 'item' && onAreaSelect) {
        begin(e, 'area', '', { clickTarget: target });
        return;
      }
      e.stopPropagation();
      onSelectionChange(target, { additive: true });
      return;
    }
    const selected =
      sameSelection(target, selection) ||
      (kind === 'item' && selectionGroup.some((g) => sameSelection(target, g)));
    if (selected && kind) {
      begin(e, kind, target.id, extra);
      return;
    }
    e.stopPropagation();
    onSelectionChange(target);
  };

  useImperativeHandle(apiRef, () => ({
    captureImage: async (scaleFactor = 2) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const markup = new XMLSerializer().serializeToString(clone);
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('svg'));
          img.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = size.w * scaleFactor;
        canvas.height = size.h * scaleFactor;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      } catch {
        return null;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  }));

  if (!level || !data) return null;
  const s = current.s;
  const px = (n: number) => n / s;
  const viewBox = `${current.cx - size.w / (2 * s)} ${-current.cy - size.h / (2 * s)} ${size.w / s} ${size.h / s}`;

  // Cotas del recinto seleccionado (o del que contiene lo seleccionado).
  const dimensioned = (() => {
    if (!selection) return null;
    let roomId: string | undefined;
    if (selection.kind === 'room') roomId = selection.id;
    else if (selection.kind === 'wall') {
      roomId = (
        selection.face
          ? roomOnWallFace(level, selection.id, selection.face)
          : roomsOfWall(level, selection.id)[0]
      )?.id;
    }
    return data.rooms.find((r) => r.room.id === roomId) ?? null;
  })();
  const selectedRoom =
    selection?.kind === 'room' ? level.rooms.find((r) => r.id === selection.id) : undefined;
  // Los extremos de un muro suelto seleccionado se arrastran como los vértices de un recinto.
  const selectedFreeWall =
    selection?.kind === 'wall' && roomsOfWall(level, selection.id).length === 0
      ? level.walls.find((w) => w.id === selection.id)
      : undefined;
  const nodes = new Map(level.nodes.map((n) => [n.id, n]));
  // Vértices arrastrables: las esquinas del recinto seleccionado (mover un nodo intermedio de
  // un lado recto, una unión en T, lo doblaría) o los extremos del muro suelto seleccionado.
  const handleNodeIds =
    !onNodeDrag || capturing
      ? []
      : selectedRoom
        ? roomSides(level, selectedRoom).map((side) => selectedRoom.boundary[side.edgeIndices[0]!]!)
        : selectedFreeWall
          ? [selectedFreeWall.start, selectedFreeWall.end]
          : [];

  // Tramo en curso de la herramienta de muros.
  const preview = (() => {
    const from = draw.from;
    const end = typedEnd(draw) ?? draw.cursor?.point;
    if (!drawing || !from || !end) return null;
    const len = distance(from, end);
    const dir = len > 0 ? normalize(sub(end, from)) : { x: 1, y: 0 };
    return {
      from,
      end,
      label: add(lerp(from, end, 0.5), scale(perpLeft(dir), px(16) + wallThickness / 2)),
      text: draw.typed !== '' ? `${draw.typed}\u258f` : formatLength(len, locale),
    };
  })();

  return (
    <svg
      ref={svgRef}
      className="size-full touch-none select-none"
      data-testid="plan-view"
      viewBox={viewBox}
      style={{ background: COLORS.background, cursor: capturing ? 'crosshair' : undefined }}
      onPointerDown={(e) =>
        begin(e, onAreaSelect && !capturing && isAdditiveClick(e) ? 'area' : 'pan')
      }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onWheel={onWheel}
      onDoubleClick={() => {
        if (!drawing) setView(null);
      }}
      onPointerLeave={() => {
        if (drawing) setDraw((prev) => ({ ...prev, cursor: null }));
      }}
    >
      <g pointerEvents={capturing ? 'none' : undefined}>
        {/* Recintos */}
        {data.rooms.map(({ room, interior }) => {
          const target = { kind: 'room', id: room.id } as const;
          const state = stateOf(target);
          return (
            <polygon
              key={room.id}
              points={pts(interior)}
              fill={COLORS.room[state]}
              data-testid={`plan-room-${room.name}`}
              style={{ cursor: state === 'selected' ? 'move' : 'pointer' }}
              onPointerDown={(e) => pick(target, e, 'room')}
              onPointerEnter={() => hover(target)}
              onPointerLeave={() => hover(null)}
            />
          );
        })}

        {/* Muebles */}
        {data.items.map(({ item, footprint, front, name, mount }) => {
          const target = { kind: 'item', id: item.id } as const;
          const state = stateOf(target);
          return (
            <g
              key={item.id}
              data-testid={`plan-item-${name}`}
              style={{ cursor: state === 'selected' ? 'move' : 'pointer' }}
              onPointerDown={(e) => pick(target, e, 'item')}
              onPointerEnter={() => hover(target)}
              onPointerLeave={() => hover(null)}
            >
              <title>{name}</title>
              <polygon
                points={pts(footprint)}
                fill={mount === 'ceiling' ? 'none' : COLORS.item[state]}
                fillOpacity={mount === 'floor' ? 0.9 : 0.6}
                stroke={COLORS.itemStroke[state]}
                strokeWidth={px(state === 'normal' ? 1 : 2)}
                strokeDasharray={mount === 'ceiling' ? `${px(4)} ${px(3)}` : undefined}
              />
              <circle cx={front.x} cy={-front.y} r={px(2)} fill={COLORS.itemStroke[state]} />
            </g>
          );
        })}

        {/* Muros (con huecos en los vanos) */}
        {data.walls.map(({ wall, pieces }) => {
          const target = { kind: 'wall', id: wall.id } as const;
          const state = stateOf(target);
          return (
            <g
              key={wall.id}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => pick(target, e)}
              onPointerEnter={() => hover(target)}
              onPointerLeave={() => hover(null)}
            >
              {pieces.map((piece, i) => (
                <polygon key={i} points={pts(piece)} fill={COLORS.wall[state]} />
              ))}
            </g>
          );
        })}

        {/* Vanos: jambas y símbolos (arcos de apertura, paños) */}
        {data.openings.map(({ opening, fp, strokes, jambs }) => {
          const target = { kind: 'opening', id: opening.id } as const;
          const state = stateOf(target);
          const color = COLORS.opening[state];
          return (
            <g
              key={opening.id}
              style={{ cursor: state === 'selected' ? 'ew-resize' : 'pointer' }}
              onPointerDown={(e) => pick(target, e, 'opening', { dir: fp.dir })}
              onPointerEnter={() => hover(target)}
              onPointerLeave={() => hover(null)}
            >
              {/* Zona de clic generosa sobre el hueco del muro. */}
              <polygon
                points={pts([jambs[0]![0]!, jambs[1]![0]!, jambs[1]![1]!, jambs[0]![1]!])}
                fill={state === 'normal' ? 'transparent' : '#dbeafe'}
              />
              {jambs.map((j, i) => (
                <polyline
                  key={`j${i}`}
                  points={pts(j)}
                  stroke={color}
                  strokeWidth={px(1.5)}
                  fill="none"
                />
              ))}
              {strokes.map((stroke, i) => (
                <polyline
                  key={i}
                  points={pts(stroke.points)}
                  stroke={color}
                  strokeWidth={px(state === 'normal' ? 1.2 : 2)}
                  strokeDasharray={stroke.dashed ? `${px(4)} ${px(3)}` : undefined}
                  fill="none"
                />
              ))}
            </g>
          );
        })}
      </g>

      {/* Nombres y superficies */}
      {data.rooms.map(({ room, label, area }) => (
        <g key={`label-${room.id}`} pointerEvents="none">
          <text
            x={label.x}
            y={-label.y}
            textAnchor="middle"
            fontSize={px(13)}
            fontWeight={600}
            fill={COLORS.text}
            fontFamily="system-ui, sans-serif"
            stroke="#ffffff"
            strokeWidth={px(3)}
            paintOrder="stroke"
          >
            {room.name}
          </text>
          <text
            x={label.x}
            y={-label.y + px(16)}
            textAnchor="middle"
            fontSize={px(11)}
            fill={COLORS.muted}
            fontFamily="system-ui, sans-serif"
            stroke="#ffffff"
            strokeWidth={px(3)}
            paintOrder="stroke"
          >
            {formatArea(area, locale)}
          </text>
        </g>
      ))}

      {/* Cotas interiores del recinto seleccionado */}
      {dimensioned?.sides.map((side, i) => {
        const inward = isCounterClockwise(dimensioned.interior) ? 1 : -1;
        const n = scale(perpLeft(normalize(sub(side.end, side.start))), inward * px(18));
        const mid = add(lerp(side.start, side.end, 0.5), n);
        return (
          <g key={`dim-${i}`} pointerEvents="none">
            <polyline
              points={pts([add(side.start, n), add(side.end, n)])}
              stroke={COLORS.dimension}
              strokeWidth={px(1)}
              fill="none"
            />
            <text
              x={mid.x}
              y={-mid.y}
              dy={px(4)}
              textAnchor="middle"
              fontSize={px(11)}
              fontWeight={600}
              fill={COLORS.dimension}
              stroke="#ffffff"
              strokeWidth={px(3)}
              paintOrder="stroke"
              fontFamily="system-ui, sans-serif"
              data-testid="plan-dimension"
            >
              {formatLength(side.length, locale)}
            </text>
          </g>
        );
      })}

      {/* Vértices: se arrastran para cambiar la forma */}
      {handleNodeIds.map((nodeId) => {
        const node = nodes.get(nodeId);
        if (!node) return null;
        return (
          <circle
            key={nodeId}
            cx={node.x}
            cy={-node.y}
            r={px(6)}
            fill="#ffffff"
            stroke={COLORS.dimension}
            strokeWidth={px(2)}
            style={{ cursor: 'grab' }}
            data-testid="plan-node"
            onPointerDown={(e) => begin(e, 'node', nodeId, { origin: { x: node.x, y: node.y } })}
          />
        );
      })}

      {/* Recuadro de selección */}
      {area && (
        <rect
          x={Math.min(area.a.x, area.b.x)}
          y={-Math.max(area.a.y, area.b.y)}
          width={Math.abs(area.a.x - area.b.x)}
          height={Math.abs(area.a.y - area.b.y)}
          fill={COLORS.dimension}
          fillOpacity={0.08}
          stroke={COLORS.dimension}
          strokeWidth={px(1)}
          strokeDasharray={`${px(4)} ${px(3)}`}
          pointerEvents="none"
          data-testid="plan-area-select"
        />
      )}

      {/* Herramienta de muros: nodos a los que engancharse, tramo en curso y su largo */}
      {drawing && (
        <g pointerEvents="none" data-testid="plan-draw-overlay">
          {level.nodes.map((n) => (
            <circle key={n.id} cx={n.x} cy={-n.y} r={px(3)} fill={COLORS.wall.normal} />
          ))}
          {preview && (
            <>
              <polyline
                points={pts([preview.from, preview.end])}
                stroke={COLORS.dimension}
                strokeOpacity={0.35}
                strokeWidth={wallThickness}
                fill="none"
              />
              <polyline
                points={pts([preview.from, preview.end])}
                stroke={COLORS.dimension}
                strokeWidth={px(1.5)}
                strokeDasharray={`${px(6)} ${px(4)}`}
                fill="none"
              />
              <circle cx={preview.from.x} cy={-preview.from.y} r={px(4)} fill={COLORS.dimension} />
              <text
                x={preview.label.x}
                y={-preview.label.y}
                dy={px(4)}
                textAnchor="middle"
                fontSize={px(12)}
                fontWeight={600}
                fill={COLORS.dimension}
                stroke="#ffffff"
                strokeWidth={px(3)}
                paintOrder="stroke"
                fontFamily="system-ui, sans-serif"
                data-testid="plan-draw-length"
              >
                {preview.text}
              </text>
            </>
          )}
          {draw.cursor && (
            <circle
              cx={draw.cursor.point.x}
              cy={-draw.cursor.point.y}
              r={px(draw.cursor.kind === 'node' || draw.cursor.kind === 'wall' ? 7 : 4)}
              fill={draw.cursor.kind === 'node' ? SNAP_COLORS.node : '#ffffff'}
              fillOpacity={draw.cursor.kind === 'node' ? 0.25 : 1}
              stroke={SNAP_COLORS[draw.cursor.kind]}
              strokeWidth={px(2)}
            />
          )}
        </g>
      )}
    </svg>
  );
}
