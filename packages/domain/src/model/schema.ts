import { z } from 'zod';

/**
 * Esquema del documento de proyecto (versión 1).
 *
 * Reglas de evolución (ver ADR-003):
 * - Todo cambio incompatible sube `schemaVersion` y agrega una migración en `io/migrations`.
 * - Las longitudes son milímetros enteros; los ángulos, grados.
 * - El contenido de catálogo (puertas, muebles, materiales) se referencia por `DefinitionRef`
 *   (`categoria.nombre@version`) y sus parámetros viajan como un diccionario genérico, de modo
 *   que agregar contenido nuevo no requiere cambiar este esquema.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export const IdSchema = z.string().min(1).max(64);
export const MillimetersSchema = z.number().int();
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const DefinitionRefSchema = z
  .string()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+@\d+$/, 'Referencia de definición inválida');
export const ParamValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export const ParamsSchema = z.record(z.string(), ParamValueSchema);

export const WALL_LIMITS = {
  thickness: { min: 20, max: 1000 },
  height: { min: 500, max: 10_000 },
  /** Largo mínimo de un tramo (las uniones en T pueden dejar tramos cortos). */
  length: { min: 2 },
} as const;

export const NodeSchema = z.object({
  id: IdSchema,
  x: MillimetersSchema,
  y: MillimetersSchema,
});

/** Materiales por cara; `left`/`right` según la dirección start → end. */
export const WallFinishSchema = z.object({
  left: IdSchema.optional(),
  right: IdSchema.optional(),
});

export const WallSchema = z.object({
  id: IdSchema,
  /** Identificador dado por el usuario; si falta, la UI muestra «Lado n» según el recinto. */
  name: z.string().max(80).optional(),
  start: IdSchema,
  end: IdSchema,
  thickness: MillimetersSchema.min(WALL_LIMITS.thickness.min).max(WALL_LIMITS.thickness.max),
  height: MillimetersSchema.min(WALL_LIMITS.height.min).max(WALL_LIMITS.height.max),
  finish: WallFinishSchema.optional(),
});

/** Vano (puerta, ventana) alojado en un muro. `offset` = distancia del nodo start al centro. */
export const OpeningSchema = z.object({
  id: IdSchema,
  wallId: IdSchema,
  def: DefinitionRefSchema,
  offset: MillimetersSchema.nonnegative(),
  params: ParamsSchema,
});

export const RoomSchema = z.object({
  id: IdSchema,
  name: z.string().max(80),
  /** Nodos del contorno (eje de muros), en orden. Cada par consecutivo está unido por un muro. */
  boundary: z.array(IdSchema).min(3),
  floor: IdSchema.optional(),
  ceiling: IdSchema.optional(),
  /**
   * Espacio no habitable: encerrado sin acceso (un ducto) o un clóset empotrado. No suma a la
   * superficie útil, se ve cerrado y no se recorre.
   */
  uninhabitable: z.boolean().optional(),
});

export const Vec3MmSchema = z.object({
  x: MillimetersSchema,
  y: MillimetersSchema,
  /** Altura sobre el nivel. */
  z: MillimetersSchema,
});

/** Mueble, luminaria o decoración: todos son items con distinta definición de catálogo. */
export const ItemSchema = z.object({
  id: IdSchema,
  def: DefinitionRefSchema,
  position: Vec3MmSchema,
  /** Rotación en planta, grados antihorarios. */
  rotation: z.number(),
  params: ParamsSchema,
  materials: z.record(z.string(), IdSchema).optional(),
});

export const LevelSchema = z.object({
  id: IdSchema,
  name: z.string().max(80),
  elevation: MillimetersSchema,
  nodes: z.array(NodeSchema),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  rooms: z.array(RoomSchema),
  items: z.array(ItemSchema),
});

/** Instancia de material: definición base de catálogo + ajustes del usuario. */
export const MaterialSchema = z.object({
  id: IdSchema,
  def: DefinitionRefSchema,
  name: z.string().max(80).optional(),
  tint: HexColorSchema.optional(),
  scale: z.number().positive().optional(),
  rotation: z.number().optional(),
  /** Parámetros propios de la definición (tamaño de baldosa, color de fragüe…). */
  params: ParamsSchema.optional(),
});

export const AssetSchema = z.object({
  id: IdSchema,
  kind: z.enum(['image']),
  mime: z.string().min(1),
  path: z.string().min(1),
});

export const ProjectMetaSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Aplicación y versión que escribió el archivo, p. ej. `decodeny@0.1.0`. */
  generator: z.string().min(1),
});

export const ProjectSettingsSchema = z.object({
  defaultWallHeight: MillimetersSchema.min(WALL_LIMITS.height.min).max(WALL_LIMITS.height.max),
  defaultWallThickness: MillimetersSchema.min(WALL_LIMITS.thickness.min).max(
    WALL_LIMITS.thickness.max,
  ),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: ProjectMetaSchema,
  settings: ProjectSettingsSchema,
  levels: z.array(LevelSchema).min(1),
  materials: z.array(MaterialSchema),
  assets: z.array(AssetSchema),
});
