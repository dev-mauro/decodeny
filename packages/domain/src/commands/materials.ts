import { HEX_COLOR } from '../catalog/params';
import { DomainError } from '../errors';
import {
  materialOfSurface,
  pruneUnusedMaterials,
  setSurfaceMaterial,
  type SurfaceTarget,
} from '../model/materials';
import { requireLevel } from '../model/queries';
import { DefinitionRefSchema } from '../model/schema';
import type { MaterialInstance, Params, Project } from '../model/types';
import { defineCommand } from './command';

/** Valores editables de una instancia de material. */
export interface MaterialSettings {
  readonly tint?: string;
  readonly scale?: number;
  readonly rotation?: number;
  readonly params?: Params;
  readonly name?: string;
}

function requireMaterial(project: Project, id: string): MaterialInstance {
  const material = project.materials.find((m) => m.id === id);
  if (!material) throw new DomainError('not-found', `Material ${id} no existe`, { id });
  return material;
}

function applySettings(material: MaterialInstance, settings: MaterialSettings): void {
  if (settings.tint !== undefined) {
    if (!HEX_COLOR.test(settings.tint)) {
      throw new DomainError('invalid-argument', 'Color inválido', { field: 'tint' });
    }
    material.tint = settings.tint.toLowerCase();
  }
  if (settings.scale !== undefined) {
    if (!Number.isFinite(settings.scale) || settings.scale <= 0) {
      throw new DomainError('out-of-range', 'Escala inválida', { field: 'scale', min: 0 });
    }
    material.scale = settings.scale;
  }
  if (settings.rotation !== undefined) {
    if (!Number.isFinite(settings.rotation)) {
      throw new DomainError('invalid-argument', 'Rotación inválida', { field: 'rotation' });
    }
    material.rotation = ((settings.rotation % 360) + 360) % 360;
  }
  if (settings.params) material.params = { ...material.params, ...settings.params };
  if (settings.name !== undefined) {
    const name = settings.name.trim().slice(0, 80);
    if (name === '') delete material.name;
    else material.name = name;
  }
}

export interface ApplyMaterialArgs {
  readonly levelId: string;
  readonly targets: readonly SurfaceTarget[];
  /**
   * Un material nuevo de catálogo (`def` + ajustes) o una instancia existente (`materialId`,
   * p. ej. con el cuentagotas): las superficies que comparten instancia cambian juntas.
   */
  readonly material:
    ({ readonly def: string } & MaterialSettings) | { readonly materialId: string };
}

/** Aplica un material a una o varias superficies y devuelve la instancia usada. */
export const applyMaterial = defineCommand<ApplyMaterialArgs, { readonly materialId: string }>(
  'material.apply',
  (draft, args, ctx) => {
    const level = requireLevel(draft, args.levelId);
    let materialId: string;
    if ('materialId' in args.material) {
      materialId = requireMaterial(draft, args.material.materialId).id;
    } else {
      const { def, ...settings } = args.material;
      if (!DefinitionRefSchema.safeParse(def).success) {
        throw new DomainError('invalid-argument', 'Referencia de catálogo inválida', { def });
      }
      const material: MaterialInstance = { id: ctx.ids('mat'), def };
      applySettings(material, settings);
      draft.materials.push(material);
      materialId = material.id;
    }
    for (const target of args.targets) setSurfaceMaterial(level, target, materialId);
    pruneUnusedMaterials(draft);
    return { materialId };
  },
);

export interface UpdateMaterialArgs extends MaterialSettings {
  readonly materialId: string;
  /** Cambia el tipo conservando color y ajustes compatibles. */
  readonly def?: string;
}

/** Cambia una instancia: afecta a todas las superficies que la usan. */
export const updateMaterial = defineCommand<UpdateMaterialArgs>(
  'material.update',
  (draft, args) => {
    const material = requireMaterial(draft, args.materialId);
    if (args.def !== undefined) {
      if (!DefinitionRefSchema.safeParse(args.def).success) {
        throw new DomainError('invalid-argument', 'Referencia de catálogo inválida', {
          def: args.def,
        });
      }
      material.def = args.def;
    }
    applySettings(material, args);
  },
);

/** Da a una superficie su propia copia del material, para cambiarla sin afectar a las demás. */
export const detachMaterial = defineCommand<
  { readonly levelId: string; readonly target: SurfaceTarget },
  { readonly materialId: string | null }
>('material.detach', (draft, args, ctx) => {
  const level = requireLevel(draft, args.levelId);
  const currentId = materialOfSurface(level, args.target);
  if (!currentId) return { materialId: null };
  const source = requireMaterial(draft, currentId);
  // Copia explícita: `structuredClone` no acepta borradores de Immer.
  const copy: MaterialInstance = {
    ...source,
    id: ctx.ids('mat'),
    ...(source.params ? { params: { ...source.params } } : {}),
  };
  delete copy.name;
  draft.materials.push(copy);
  setSurfaceMaterial(level, args.target, copy.id);
  return { materialId: copy.id };
});

/** Vuelve las superficies a la terminación por defecto. */
export const clearMaterial = defineCommand<{
  readonly levelId: string;
  readonly targets: readonly SurfaceTarget[];
}>('material.clear', (draft, args) => {
  const level = requireLevel(draft, args.levelId);
  for (const target of args.targets) setSurfaceMaterial(level, target, null);
  pruneUnusedMaterials(draft);
});
