import { itemBase, itemEnvelope, resolveItemDefinition } from '@decodeny/catalog';
import {
  dot,
  itemWarnings,
  levelWallExposure,
  levelWallFootprints,
  roomOfItem,
  mmToMeters,
  openingEnvelope,
  perpLeft,
  roomEdges,
  roomInteriorPolygon,
  roomOnWallFace,
  roomSides,
  roomsOfWall,
  type Level,
  type ResolvedMaterial,
  type WallExposure,
  type WallFootprint,
} from '@decodeny/domain';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plane, Vector3, type Group } from 'three';
import type { WallCut } from '../builders/wall-mesh';
import { planDirToWorld, planToWorld } from '../coords';
import {
  interactionState,
  sameSelection,
  type ItemDragEvent,
  type OpeningDragEvent,
  type RoomDragEvent,
  type ViewerSelection,
  type SelectOptions,
} from '../selection';
import { contactShadowItems, FLAT_ITEM_MM } from './contact-shadows';
import { ContactShadows } from './ContactShadows';
import { ItemView } from './ItemView';
import { itemGroupOf, type ItemGroup } from './item-groups';
import { LevelLights } from './LevelLights';
import { MeasureClicks } from './MeasureClicks';
import type { MeasurePoint } from './measure';
import { MeasureOverlay } from './MeasureOverlay';
import { facingCutWalls, sameWallSet, wallAt, type SectionMode } from './section-cutaway';
import { SectionClipping, WallSectionCaps } from './WallSection';
import { OpeningView } from './OpeningView';
import { RoomDimensions } from './RoomDimensions';
import { RoomSurfaces } from './RoomSurfaces';
import { usePlaneDrag } from './use-plane-drag';
import { WallMesh } from './WallMesh';

interface LevelViewProps {
  readonly level: Level;
  readonly selection: ViewerSelection | null;
  /** Otras entidades seleccionadas junto con `selection` (selección múltiple). */
  readonly selectionGroup?: readonly ViewerSelection[] | undefined;
  readonly onSelect: (selection: ViewerSelection | null, options?: SelectOptions) => void;
  readonly locale: string;
  /** En modos de recorrido se desactivan selección, hover y cotas. */
  readonly interactive: boolean;
  /** Entidades resaltadas desde fuera del visor (p. ej. al pasar el mouse por el panel). */
  readonly highlighted?: readonly ViewerSelection[] | undefined;
  readonly onHoverChange?: ((target: ViewerSelection | null) => void) | undefined;
  readonly onRoomDrag?: ((event: RoomDragEvent) => void) | undefined;
  readonly onOpeningDrag?: ((event: OpeningDragEvent) => void) | undefined;
  readonly onItemDrag?: ((event: ItemDragEvent) => void) | undefined;
  /** Terminaciones del proyecto resueltas, por id de instancia. */
  readonly finishes?: ReadonlyMap<string, ResolvedMaterial> | undefined;
  readonly assetUrl?: ((assetId: string) => string | undefined) | undefined;
  /** Grupos de items ocultos (capas). */
  readonly hiddenGroups?: ReadonlySet<ItemGroup> | undefined;
  /** Altura de corte (mm sobre el nivel) para ver los interiores; `null` sin corte. */
  readonly sectionHeight?: number | null | undefined;
  /** `facing`: el corte solo recorta los muros que tapan el interior desde la cámara. */
  readonly sectionMode?: SectionMode | undefined;
  /** Muros recortados por el corte `facing` (ids ordenados), o `null` si no aplica. */
  readonly onSectionCutChange?: ((wallIds: readonly string[] | null) => void) | undefined;
  /** Herramienta de medición: los clics marcan puntos en vez de seleccionar. */
  readonly onMeasurePoint?: ((point: MeasurePoint) => void) | undefined;
  readonly measurePoints?: readonly MeasurePoint[] | undefined;
  /** Muros, pisos y cielos con su material real, sin brillo de selección ni resaltado. */
  readonly trueSurfaceColors?: boolean | undefined;
  /** Las luminarias más cercanas proyectan sombra (de noche, cuando se notan). */
  readonly lampShadows?: boolean | undefined;
}

const NO_FINISHES: ReadonlyMap<string, ResolvedMaterial> = new Map();

const NO_HIGHLIGHT: readonly ViewerSelection[] = [];
const NO_CUTS: readonly WallCut[] = [];

/** Proyección de un nivel del documento a la escena (muros, pisos, cielos y cotas). */
export function LevelView({
  level,
  selection,
  selectionGroup = NO_HIGHLIGHT,
  onSelect,
  locale,
  interactive,
  highlighted = NO_HIGHLIGHT,
  onHoverChange,
  onRoomDrag,
  onOpeningDrag,
  onItemDrag,
  finishes = NO_FINISHES,
  assetUrl,
  hiddenGroups,
  sectionHeight = null,
  sectionMode = 'all',
  onSectionCutChange,
  onMeasurePoint,
  measurePoints,
  trueSurfaceColors = false,
  lampShadows = false,
}: LevelViewProps) {
  const measuring = interactive && onMeasurePoint !== undefined;
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState<ViewerSelection | null>(null);
  const hoveredRef = useRef<ViewerSelection | null>(null);
  const gl = useThree((s) => s.gl);
  const drag = usePlaneDrag();

  const footprints = useMemo(() => levelWallFootprints(level), [level]);
  // Corte de los que tapan: qué muros se recortan según la cámara (`null`: aún sin calcular).
  const cutaway = sectionHeight !== null && sectionMode === 'facing';
  const exposure = useMemo(() => (cutaway ? levelWallExposure(level) : null), [cutaway, level]);
  const [cutWalls, setCutWalls] = useState<ReadonlySet<string> | null>(null);
  const activeCuts = exposure ? cutWalls : null;
  useEffect(() => {
    onSectionCutChange?.(activeCuts ? [...activeCuts].sort() : null);
  }, [activeCuts, onSectionCutChange]);
  const sectioned = (wallId: string) => !activeCuts || activeCuts.has(wallId);
  const cutsByWall = useMemo(() => {
    const map = new Map<string, WallCut[]>();
    for (const opening of level.openings) {
      const cut = { offset: opening.offset, ...openingEnvelope(opening) };
      const list = map.get(opening.wallId);
      if (list) list.push(cut);
      else map.set(opening.wallId, [cut]);
    }
    return map;
  }, [level.openings]);
  // Muebles de piso visibles, con su apoyo: llevan sombra de contacto.
  const contactItems = useMemo(
    () =>
      contactShadowItems(
        level,
        (item) => !hiddenGroups?.has(itemGroupOf(resolveItemDefinition(item.def).category)),
      ),
    [hiddenGroups, level],
  );
  const warnings = useMemo(
    () => itemWarnings(level, itemEnvelope, (item) => itemBase(level, item)),
    [level],
  );
  const rooms = useMemo(
    () =>
      level.rooms.map((room) => {
        const edges = roomEdges(level, room);
        return {
          room,
          sides: roomSides(level, room),
          interior: roomInteriorPolygon(level, room),
          ceilingHeight: Math.max(...edges.map((e) => e.wall?.height ?? 0)),
        };
      }),
    [level],
  );

  const handleHover = useCallback(
    (target: ViewerSelection | null) => {
      if (!interactive || sameSelection(hoveredRef.current, target)) return;
      hoveredRef.current = target;
      setHovered(target);
      onHoverChange?.(target);
    },
    [interactive, onHoverChange],
  );
  // Al salir de edición, el hover informado deja de ser válido.
  useEffect(() => {
    if (!interactive && hoveredRef.current) {
      hoveredRef.current = null;
      onHoverChange?.(null);
    }
  }, [interactive, onHoverChange]);

  const handleSelect = useCallback(
    (target: ViewerSelection, options?: SelectOptions) => {
      if (interactive && !measuring) onSelect(target, options);
    },
    [interactive, measuring, onSelect],
  );
  const activeHover = interactive ? hovered : null;
  const stateOf = (target: ViewerSelection) =>
    interactive
      ? interactionState(target, selection, activeHover, highlighted, selectionGroup)
      : 'normal';
  const surfaceStateOf = (target: ViewerSelection) =>
    trueSurfaceColors ? 'normal' : stateOf(target);

  // Solo lo seleccionado se arrastra: arrastrar el resto orbita la cámara.
  const movable = (target: ViewerSelection) =>
    interactive &&
    !measuring &&
    (sameSelection(target, selection) ||
      // Los muebles de una selección múltiple se arrastran juntos desde cualquiera de ellos.
      (target.kind === 'item' && selectionGroup.some((g) => sameSelection(target, g)))) &&
    (target.kind === 'room'
      ? !!onRoomDrag
      : target.kind === 'opening'
        ? !!onOpeningDrag
        : target.kind === 'item' && !!onItemDrag);

  const startRoomDrag = useCallback(
    (roomId: string, e: ThreeEvent<PointerEvent>) => {
      if (!onRoomDrag) return;
      const plane = new Plane(new Vector3(0, 1, 0), -mmToMeters(level.elevation));
      drag.begin(`room:${roomId}`, e, {
        plane,
        onMove: (delta, ev) => onRoomDrag({ phase: 'move', roomId, delta, snap: !ev.altKey }),
        onFinish: (phase, delta, snap) => onRoomDrag({ phase, roomId, delta, snap }),
      });
    },
    [drag, level.elevation, onRoomDrag],
  );
  const startOpeningDrag = useCallback(
    (openingId: string, footprint: WallFootprint, e: ThreeEvent<PointerEvent>) => {
      if (!onOpeningDrag) return;
      // Plano de arrastre: horizontal a la altura del punto tomado (sirve desde arriba y en
      // perspectiva) o, si la cámara mira casi horizontal, el plano vertical del muro.
      const grazing = Math.abs(e.ray.direction.y) < 0.25;
      const plane = grazing
        ? new Plane().setFromNormalAndCoplanarPoint(
            new Vector3(...planDirToWorld(perpLeft(footprint.dir))),
            new Vector3(...planToWorld(footprint.start, level.elevation)),
          )
        : new Plane(new Vector3(0, 1, 0), -e.point.y);
      const along = (delta: { x: number; y: number }) => dot(delta, footprint.dir);
      drag.begin(`opening:${openingId}`, e, {
        plane,
        onMove: (delta, ev) =>
          onOpeningDrag({ phase: 'move', openingId, along: along(delta), snap: !ev.altKey }),
        onFinish: (phase, delta, snap) =>
          onOpeningDrag({ phase, openingId, along: along(delta), snap }),
      });
    },
    [drag, level.elevation, onOpeningDrag],
  );

  const startItemDrag = useCallback(
    (itemId: string, e: ThreeEvent<PointerEvent>) => {
      if (!onItemDrag) return;
      const plane = new Plane(new Vector3(0, 1, 0), -mmToMeters(level.elevation));
      drag.begin(`item:${itemId}`, e, {
        plane,
        onMove: (delta, ev) => onItemDrag({ phase: 'move', itemId, delta, snap: !ev.altKey }),
        onFinish: (phase, delta, snap) => onItemDrag({ phase, itemId, delta, snap }),
      });
    },
    [drag, level.elevation, onItemDrag],
  );

  // Cursor: mover sobre lo seleccionado, mano sobre lo demás, agarre al arrastrar.
  const cursor = drag.dragging
    ? 'grabbing'
    : activeHover
      ? movable(activeHover)
        ? 'move'
        : 'pointer'
      : null;
  useEffect(() => {
    if (!cursor) return;
    gl.domElement.style.cursor = cursor;
    return () => {
      gl.domElement.style.cursor = '';
    };
  }, [cursor, gl]);

  // Cotas del recinto seleccionado, o del recinto desde el que se mira el muro o vano elegido.
  const dimensioned = useMemo(() => {
    if (!selection || !interactive) return null;
    let room;
    let wallId: string | undefined;
    if (selection.kind === 'room') {
      room = level.rooms.find((r) => r.id === selection.id);
    } else if (selection.kind === 'item') {
      const item = level.items.find((i) => i.id === selection.id);
      room = item ? roomOfItem(level, item) : undefined;
    } else {
      wallId =
        selection.kind === 'wall'
          ? selection.id
          : level.openings.find((o) => o.id === selection.id)?.wallId;
      if (wallId === undefined) return null;
      const face = selection.kind === 'wall' ? selection.face : undefined;
      room =
        (face ? roomOnWallFace(level, wallId, face) : undefined) ?? roomsOfWall(level, wallId)[0];
    }
    const entry = rooms.find((r) => r.room.id === room?.id);
    if (!entry) return null;
    const sideOfWall = (id: string | undefined) => {
      const i = entry.sides.findIndex((s) => id !== undefined && s.wallIds.includes(id));
      return i >= 0 ? i : undefined;
    };
    return { entry, sideOfWall, highlight: sideOfWall(wallId) };
  }, [interactive, level, rooms, selection]);

  const hoverWall =
    activeHover?.kind === 'wall' ? activeHover.id : highlighted.find((h) => h.kind === 'wall')?.id;

  return (
    <group ref={groupRef} name={`level:${level.id}`} position-y={level.elevation / 1000}>
      {measuring && (
        <MeasureClicks target={groupRef} elevation={level.elevation} onPoint={onMeasurePoint} />
      )}
      {level.walls.map((wall) => {
        const footprint = footprints.get(wall.id);
        if (!footprint) return null;
        return (
          <WallMesh
            key={wall.id}
            wall={wall}
            footprint={footprint}
            cuts={cutsByWall.get(wall.id) ?? NO_CUTS}
            leftFinish={wall.finish?.left ? finishes.get(wall.finish.left) : undefined}
            rightFinish={wall.finish?.right ? finishes.get(wall.finish.right) : undefined}
            state={surfaceStateOf({ kind: 'wall', id: wall.id })}
            sectioned={sectioned(wall.id)}
            onSelect={handleSelect}
            onHover={handleHover}
          />
        );
      })}
      {rooms.map(({ room, interior, ceilingHeight }) => (
        <RoomSurfaces
          key={room.id}
          room={room}
          interior={interior}
          ceilingHeight={ceilingHeight}
          floorFinish={room.floor ? finishes.get(room.floor) : undefined}
          ceilingFinish={room.ceiling ? finishes.get(room.ceiling) : undefined}
          state={surfaceStateOf({ kind: 'room', id: room.id })}
          ceilingShadows={!interactive}
          onSelect={handleSelect}
          onHover={handleHover}
          onDragStart={movable({ kind: 'room', id: room.id }) ? startRoomDrag : undefined}
        />
      ))}
      {level.openings.map((opening) => {
        const footprint = footprints.get(opening.wallId);
        if (!footprint) return null;
        const target = { kind: 'opening', id: opening.id } as const;
        return (
          <OpeningView
            key={opening.id}
            opening={opening}
            footprint={footprint}
            state={stateOf(target)}
            showPlan={interactive}
            sectioned={sectioned(opening.wallId)}
            onSelect={handleSelect}
            onHover={handleHover}
            onDragStart={movable(target) ? startOpeningDrag : undefined}
          />
        );
      })}
      {level.items.map((item) => {
        const definition = resolveItemDefinition(item.def);
        if (hiddenGroups?.has(itemGroupOf(definition.category))) return null;
        // Lo plano sobre el piso (alfombras) se apoya 1 mm arriba: nunca coplanar con él.
        const flat = definition.mount === 'floor' && itemEnvelope(item).height <= FLAT_ITEM_MM;
        const base = itemBase(level, item) + (flat ? 1 : 0);
        // Con el corte activo, lo que queda entero sobre la altura de corte (cuadros altos,
        // lámparas de cielo) se oculta; los muebles no se cortan. Lo montado en un muro que
        // queda entero (corte de los que tapan) se sigue viendo.
        const onWholeWall =
          definition.mount === 'wall' &&
          activeCuts !== null &&
          !activeCuts.has(wallAt(footprints, item.position) ?? '');
        if (sectionHeight !== null && base >= sectionHeight && !onWholeWall) return null;
        const target = { kind: 'item', id: item.id } as const;
        return (
          <ItemView
            key={item.id}
            item={item}
            state={stateOf(target)}
            warning={interactive ? warnings.get(item.id) : undefined}
            base={base}
            assetUrl={assetUrl}
            showFootprint={interactive}
            onSelect={handleSelect}
            onHover={handleHover}
            onDragStart={movable(target) ? startItemDrag : undefined}
          />
        );
      })}
      <ContactShadows items={contactItems} />
      <LevelLights level={level} shadows={lampShadows} />
      {measurePoints && measurePoints.length > 0 && interactive && (
        <MeasureOverlay points={measurePoints} locale={locale} />
      )}
      <SectionClipping heightMm={sectionHeight === null ? null : level.elevation + sectionHeight} />
      {sectionHeight !== null && (
        <WallSectionCaps
          level={level}
          footprints={footprints}
          heightMm={sectionHeight}
          walls={activeCuts}
        />
      )}
      {exposure && <CutawayTracker exposure={exposure} onChange={setCutWalls} />}
      {dimensioned && (
        <RoomDimensions
          interior={dimensioned.entry.interior}
          sides={dimensioned.entry.sides}
          highlightSide={dimensioned.highlight}
          hoverSide={dimensioned.sideOfWall(hoverWall)}
          locale={locale}
        />
      )}
    </group>
  );
}

/** Recalcula, con cada cuadro dibujado, qué muros tapan el interior desde la cámara. */
function CutawayTracker({
  exposure,
  onChange,
}: {
  readonly exposure: ReadonlyMap<string, WallExposure>;
  readonly onChange: (walls: ReadonlySet<string>) => void;
}) {
  const current = useRef<ReadonlySet<string> | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  // Con el dibujo bajo demanda, un cuadro nuevo hace el primer cálculo.
  useEffect(() => invalidate(), [exposure, invalidate]);
  useFrame(({ camera }) => {
    // Mundo (m, norte = −Z) → planta (mm).
    const eye = { x: camera.position.x * 1000, y: -camera.position.z * 1000 };
    const next = facingCutWalls(exposure, eye, current.current ?? new Set());
    if (current.current && sameWallSet(next, current.current)) return;
    current.current = next;
    onChange(next);
    invalidate();
  });
  return null;
}
