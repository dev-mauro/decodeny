import { DomainError } from '../errors';
import { normalizeRotation } from '../model/items';
import { requireLevel } from '../model/queries';
import { DefinitionRefSchema, IdSchema } from '../model/schema';
import type { Item, Level, Params } from '../model/types';
import { defineCommand } from './command';

export interface ItemPosition {
  readonly x: number;
  readonly y: number;
  /** Altura sobre el piso (0 para muebles de piso). */
  readonly z?: number;
}

function requireItem(level: Level, itemId: string): Item {
  const item = level.items.find((i) => i.id === itemId);
  if (!item) throw new DomainError('not-found', `Item ${itemId} no existe`, { id: itemId });
  return item;
}

function assertFinite(field: string, ...values: readonly (number | undefined)[]): void {
  if (values.some((v) => v !== undefined && !Number.isFinite(v))) {
    throw new DomainError('invalid-argument', `${field} inválido`, { field });
  }
}

function assertRef(def: string): void {
  if (!DefinitionRefSchema.safeParse(def).success) {
    throw new DomainError('invalid-argument', 'Referencia de catálogo inválida', { def });
  }
}

export interface AddItemArgs {
  readonly levelId: string;
  /** Referencia de catálogo, p. ej. `furniture.bed@1`. */
  readonly def: string;
  /** Parámetros completos (la UI los resuelve con los valores por defecto del catálogo). */
  readonly params: Params;
  readonly position: ItemPosition;
  /** Grados antihorarios en planta (0 = frente hacia el sur). */
  readonly rotation?: number;
  /**
   * Id a usar en vez de uno nuevo. Permite repetir el comando con el mismo item (p. ej. la vista
   * previa mientras se ubica con el puntero, o una edición colaborativa); debe estar libre.
   */
  readonly id?: string;
}

/** Coloca un mueble (o cualquier item de catálogo) en el nivel. */
export const addItem = defineCommand<AddItemArgs, { readonly itemId: string }>(
  'item.add',
  (draft, args, ctx) => {
    assertRef(args.def);
    assertFinite('position', args.position.x, args.position.y, args.position.z, args.rotation);
    const level = requireLevel(draft, args.levelId);
    if (args.id !== undefined) {
      const taken = draft.levels.some((l) => l.items.some((i) => i.id === args.id));
      if (!IdSchema.safeParse(args.id).success || taken) {
        throw new DomainError('invalid-argument', 'Id de item inválido o en uso', { field: 'id' });
      }
    }
    const item: Item = {
      id: args.id ?? ctx.ids('item'),
      def: args.def,
      position: {
        x: Math.round(args.position.x),
        y: Math.round(args.position.y),
        z: Math.round(args.position.z ?? 0),
      },
      rotation: normalizeRotation(args.rotation ?? 0),
      params: { ...args.params },
    };
    level.items.push(item);
    return { itemId: item.id };
  },
);

export interface UpdateItemArgs {
  readonly levelId: string;
  readonly itemId: string;
  /** Cambia el tipo conservando posición y parámetros compatibles. */
  readonly def?: string;
  readonly params?: Params;
  readonly position?: Partial<ItemPosition>;
  readonly rotation?: number;
}

export const updateItem = defineCommand<UpdateItemArgs>('item.update', (draft, args) => {
  const item = requireItem(requireLevel(draft, args.levelId), args.itemId);
  if (args.def !== undefined) {
    assertRef(args.def);
    item.def = args.def;
  }
  if (args.params) Object.assign(item.params, args.params);
  if (args.position) {
    const { x, y, z } = args.position;
    assertFinite('position', x, y, z);
    if (x !== undefined) item.position.x = Math.round(x);
    if (y !== undefined) item.position.y = Math.round(y);
    if (z !== undefined) item.position.z = Math.max(0, Math.round(z));
  }
  if (args.rotation !== undefined) {
    assertFinite('rotation', args.rotation);
    item.rotation = normalizeRotation(args.rotation);
  }
});

export interface ItemsRef {
  readonly levelId: string;
  readonly itemIds: readonly string[];
}

export const deleteItems = defineCommand<ItemsRef>('item.delete', (draft, args) => {
  const level = requireLevel(draft, args.levelId);
  args.itemIds.forEach((id) => requireItem(level, id));
  const ids = new Set(args.itemIds);
  level.items = level.items.filter((i) => !ids.has(i.id));
});

/** Duplica items desplazados `offset` mm; devuelve los nuevos ids en el mismo orden. */
export const duplicateItems = defineCommand<
  ItemsRef & { readonly offset: { readonly x: number; readonly y: number } },
  { readonly itemIds: readonly string[] }
>('item.duplicate', (draft, args, ctx) => {
  assertFinite('offset', args.offset.x, args.offset.y);
  const level = requireLevel(draft, args.levelId);
  const copies = args.itemIds.map((id) => {
    const source = requireItem(level, id);
    const copy: Item = {
      ...source,
      id: ctx.ids('item'),
      position: {
        x: Math.round(source.position.x + args.offset.x),
        y: Math.round(source.position.y + args.offset.y),
        z: source.position.z,
      },
      params: { ...source.params },
      ...(source.materials ? { materials: { ...source.materials } } : {}),
    };
    return copy;
  });
  level.items.push(...copies);
  return { itemIds: copies.map((c) => c.id) };
});

/** Pega items copiados (de este u otro proyecto) con ids nuevos. */
export const pasteItems = defineCommand<
  { readonly levelId: string; readonly items: readonly Item[]; readonly offset: ItemPosition },
  { readonly itemIds: readonly string[] }
>('item.paste', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  const pasted = args.items.map((source): Item => {
    assertRef(source.def);
    return {
      ...source,
      id: ctx.ids('item'),
      position: {
        x: Math.round(source.position.x + args.offset.x),
        y: Math.round(source.position.y + args.offset.y),
        z: source.position.z,
      },
      params: { ...source.params },
      ...(source.materials ? { materials: { ...source.materials } } : {}),
    };
  });
  level.items.push(...pasted);
  return { itemIds: pasted.map((i) => i.id) };
});

/** Traslada varios items juntos (arrastrar o empujar una selección múltiple). */
export const moveItems = defineCommand<
  ItemsRef & { readonly delta: { readonly x: number; readonly y: number } }
>('item.move', (draft, args) => {
  assertFinite('delta', args.delta.x, args.delta.y);
  const level = requireLevel(draft, args.levelId);
  for (const id of new Set(args.itemIds)) {
    const item = requireItem(level, id);
    item.position.x = Math.round(item.position.x + args.delta.x);
    item.position.y = Math.round(item.position.y + args.delta.y);
  }
});

/**
 * Gira varios items juntos `degrees` (antihorario) alrededor de `pivot`, o del centro de sus
 * posiciones si no se indica: la disposición del grupo se conserva. Un solo item gira en su lugar.
 */
export const rotateItems = defineCommand<
  ItemsRef & {
    readonly degrees: number;
    readonly pivot?: { readonly x: number; readonly y: number };
  }
>('item.rotate', (draft, args) => {
  assertFinite('degrees', args.degrees, args.pivot?.x, args.pivot?.y);
  const level = requireLevel(draft, args.levelId);
  const items = [...new Set(args.itemIds)].map((id) => requireItem(level, id));
  if (items.length === 0) return;
  const pivot = args.pivot ?? {
    x: items.reduce((s, i) => s + i.position.x, 0) / items.length,
    y: items.reduce((s, i) => s + i.position.y, 0) / items.length,
  };
  const rad = (args.degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (const item of items) {
    const dx = item.position.x - pivot.x;
    const dy = item.position.y - pivot.y;
    item.position.x = Math.round(pivot.x + dx * cos - dy * sin);
    item.position.y = Math.round(pivot.y + dx * sin + dy * cos);
    item.rotation = normalizeRotation(item.rotation + args.degrees);
  }
});
