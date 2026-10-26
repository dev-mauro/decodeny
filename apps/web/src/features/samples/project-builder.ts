import { itemCatalog, itemEnvelope, openingCatalog, surfaceElevationAt } from '@decodeny/catalog';
import {
  addItem,
  addOpening,
  applyMaterial,
  createId,
  createRectangularRoom,
  createRoomFromPath,
  defaultParams,
  dot,
  executeCommand,
  normalize,
  roomSides,
  roomsOfWall,
  roomWallTargets,
  snapItemPlacement,
  sub,
  type Command,
  type Level,
  type Params,
  type PathSegment,
  type Project,
  type Vec2,
} from '@decodeny/domain';
import { newProject } from '@/state/project-store';

export const WALL = { height: 2400, thickness: 150 } as const;
/** Separación interior entre recintos vecinos: un espesor, para que compartan el tabique. */
export const GAP = WALL.thickness;

/**
 * Arma proyectos (ejemplo, plantillas) con los mismos comandos y reglas que la UI: los muebles
 * se apoyan en los muros igual que al arrastrarlos y los objetos de muro, cielo o superficie
 * respetan su montaje.
 */
export class ProjectBuilder {
  #project: Project;
  readonly levelId: string;

  constructor(name: string) {
    const base = newProject();
    this.#project = { ...base, meta: { ...base.meta, name } };
    this.levelId = this.#project.levels[0]!.id;
  }

  get project(): Project {
    return this.#project;
  }

  get level(): Level {
    return this.#project.levels[0]!;
  }

  run<A, R>(command: Command<A, R>, args: A): R {
    const out = executeCommand(this.#project, command, args, { ids: createId });
    this.#project = out.project;
    return out.result;
  }

  /** Recinto rectangular por su esquina interior suroeste y medidas interiores. */
  rect(name: string, origin: Vec2, width: number, depth: number): string {
    return this.run(createRectangularRoom, {
      ...WALL,
      levelId: this.levelId,
      name,
      origin,
      width,
      depth,
    }).roomId;
  }

  /** Recinto por tramos interiores (largo + giro). */
  path(name: string, origin: Vec2, segments: readonly PathSegment[]): string {
    return this.run(createRoomFromPath, {
      ...WALL,
      levelId: this.levelId,
      name,
      origin,
      segments,
    }).roomId;
  }

  /** Vano en el lado `side` de un recinto, centrado a `at` mm de la esquina interior inicial. */
  opening(roomId: string, side: number, at: number, def: string, params: Params = {}): void {
    const level = this.level;
    const s = roomSides(
      level,
      level.rooms.find((r) => r.id === roomId)!,
    )[side]!;
    const dir = normalize(sub(s.end, s.start));
    const target = { x: s.start.x + dir.x * at, y: s.start.y + dir.y * at };
    const nodes = new Map(level.nodes.map((n) => [n.id, n]));
    // El tramo del lado que contiene el punto (un lado puede tener varios muros).
    for (const wallId of s.wallIds) {
      const wall = level.walls.find((w) => w.id === wallId)!;
      const a = nodes.get(wall.start)!;
      const b = nodes.get(wall.end)!;
      const wallDir = normalize(sub(b, a));
      const offset = dot(sub(target, a), wallDir);
      if (offset < 0 || offset > dot(sub(b, a), wallDir)) continue;
      this.run(addOpening, {
        levelId: this.levelId,
        wallId,
        def,
        params: { ...defaultParams(openingCatalog.require(def).params), ...params },
        offset,
      });
      return;
    }
    throw new Error(`Sin muro para el vano en el lado ${side}`);
  }

  /** Puerta centrada en el tabique compartido por dos recintos. */
  doorBetween(a: string, b: string, def: string, params: Params = {}): void {
    const level = this.level;
    const wall = level.walls.find((w) => {
      const ids = roomsOfWall(level, w.id).map((r) => r.id);
      return ids.includes(a) && ids.includes(b);
    });
    if (!wall) throw new Error('Los recintos no comparten un muro');
    this.run(addOpening, {
      levelId: this.levelId,
      wallId: wall.id,
      def,
      params: { ...defaultParams(openingCatalog.require(def).params), ...params },
    });
  }

  /**
   * Item aproximadamente en `at`; con `snap` se apoya en el muro más cercano (respaldo contra
   * la pared y costado contra la esquina). Los de muro siempre se apoyan.
   */
  furnish(def: string, at: Vec2, rotation: number, params: Params = {}, snap = true): void {
    const definition = itemCatalog.require(def);
    const full = { ...defaultParams(definition.params), ...params };
    const env = itemEnvelope({ def, params: full });
    const wall = definition.mount === 'wall';
    const placed =
      snap || wall
        ? snapItemPlacement(this.level, at, rotation, env, { wallMounted: wall })
        : { position: at, rotation };
    const z = wall
      ? (definition.defaultElevation ?? 0)
      : definition.mount === 'surface'
        ? surfaceElevationAt(this.level, placed.position)
        : 0;
    this.run(addItem, {
      levelId: this.levelId,
      def,
      params: full,
      position: { ...placed.position, z },
      rotation: placed.rotation,
    });
  }

  /** Terminación del piso o de todos los muros interiores de un recinto. */
  finish(roomId: string, surface: 'floor' | 'walls', def: string, extra: Params = {}): void {
    const room = this.level.rooms.find((r) => r.id === roomId)!;
    const { tint, rotation, scale, ...params } = extra;
    this.run(applyMaterial, {
      levelId: this.levelId,
      targets:
        surface === 'floor' ? [{ kind: 'floor', roomId }] : roomWallTargets(this.level, room),
      material: {
        def,
        ...(typeof tint === 'string' ? { tint } : {}),
        ...(typeof rotation === 'number' ? { rotation } : {}),
        ...(typeof scale === 'number' ? { scale } : {}),
        ...(Object.keys(params).length > 0 ? { params } : {}),
      },
    });
  }
}
