import { DEFAULT_FINISHES, materialsFor, resolveMaterialDefinition } from '@decodeny/catalog';
import {
  applyMaterial,
  clearMaterial,
  localize,
  materialOfSurface,
  materialUsage,
  numberParam,
  projectColors,
  resolveMaterial,
  updateMaterial,
  type Level,
  type MaterialDefinition,
  type MaterialInstance,
  type SurfaceKind,
  type SurfaceTarget,
} from '@decodeny/domain';
import { ChevronDown, ClipboardPaste, Copy, Pipette, RotateCcw, Unlink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, ParamField } from '@/features/catalog/ParamField';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/Button';
import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';
import { MaterialSwatch } from './MaterialSwatch';

interface FinishPickerProps {
  readonly level: Level;
  readonly label: string;
  readonly surface: SurfaceKind;
  readonly targets: readonly SurfaceTarget[];
  readonly testId: string;
}

const scaleParam = numberParam({
  default: 100,
  min: 10,
  max: 1000,
  step: 10,
  unit: 'percent',
  label: { es: 'Escala del patrón', en: 'Pattern scale' },
});
const rotationParam = numberParam({
  default: 0,
  min: 0,
  max: 359,
  step: 15,
  unit: 'deg',
  label: { es: 'Rotación del patrón', en: 'Pattern rotation' },
});

/**
 * Terminación de una o varias superficies: tipo de material (catálogo), color, parámetros del
 * patrón, escala y rotación. Las superficies que comparten instancia cambian juntas; el
 * cuentagotas copia y pega la instancia entre superficies.
 */
export function FinishPicker({ level, label, surface, targets, testId }: FinishPickerProps) {
  const { t, i18n } = useTranslation();
  const run = useCommand();
  const project = useProjectStore((s) => s.project);
  const clipboard = useUiStore((s) => s.finishClipboard);
  const setClipboard = useUiStore((s) => s.setFinishClipboard);
  const [open, setOpen] = useState(false);
  const holdFinishEditor = useUiStore((s) => s.holdFinishEditor);
  // Mientras se usa el editor (puntero encima o foco dentro, p. ej. con el selector de color
  // del sistema abierto), la vista muestra el color real, sin el brillo de selección.
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const inUse = pointerInside || focusInside;
  useEffect(() => (inUse ? holdFinishEditor() : undefined), [holdFinishEditor, inUse]);

  const { instance, mixed, usage } = useMemo(() => {
    const ids = [...new Set(targets.map((tg) => materialOfSurface(level, tg)))];
    const id = ids.length === 1 ? ids[0] : null;
    const found = id ? project.materials.find((m) => m.id === id) : undefined;
    return {
      instance: found,
      mixed: ids.length > 1,
      usage: found ? (materialUsage(project).get(found.id) ?? 0) : 0,
    };
  }, [level, project, targets]);

  const definition = resolveMaterialDefinition(instance?.def ?? DEFAULT_FINISHES[surface]);
  const resolved = resolveMaterial(definition, instance);
  const options = materialsFor(surface);
  const colors = useMemo(
    () => [...new Set([...projectColors(project), ...(definition.swatches ?? [])])],
    [definition.swatches, project],
  );
  const sharedElsewhere = instance !== undefined && usage > targets.length;
  const levelId = level.id;

  /** Cambia el tipo de material: conserva el color si ambos son pinturas del mismo tono. */
  const choose = (def: MaterialDefinition) => {
    setOpen(false);
    const keepTint =
      instance?.tint &&
      def.tintable &&
      resolveMaterialDefinition(instance.def).category === def.category;
    run(applyMaterial, {
      levelId,
      targets,
      material: { def: def.id, ...(keepTint ? { tint: instance.tint } : {}) },
    });
  };

  /** Edita la instancia o, si aún no hay una, crea una con el ajuste. */
  const edit = (
    settings: Partial<Pick<MaterialInstance, 'tint' | 'scale' | 'rotation' | 'params'>>,
  ) => {
    if (instance) {
      run(
        updateMaterial,
        { materialId: instance.id, ...settings },
        { coalesceKey: `mat:${instance.id}` },
      );
    } else {
      run(applyMaterial, { levelId, targets, material: { def: definition.id, ...settings } });
    }
  };

  const detach = () => {
    if (!instance) return;
    // Copia de la instancia (sin su id ni su nombre) solo para estas superficies.
    run(applyMaterial, {
      levelId,
      targets,
      material: {
        def: instance.def,
        ...(instance.tint ? { tint: instance.tint } : {}),
        ...(instance.scale !== undefined ? { scale: instance.scale } : {}),
        ...(instance.rotation !== undefined ? { rotation: instance.rotation } : {}),
        ...(instance.params ? { params: instance.params } : {}),
      },
    });
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-slate-200 p-2.5"
      data-testid={testId}
      data-in-use={inUse || undefined}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocusInside(false);
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left hover:bg-slate-50"
          data-testid={`${testId}-toggle`}
        >
          <MaterialSwatch material={resolved} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-slate-500">{label}</span>
            <span
              className="block truncate text-sm font-medium text-slate-800"
              data-testid={`${testId}-name`}
            >
              {mixed ? t('finishes.mixed') : localize(definition.name, i18n.language)}
              {!instance && !mixed && (
                <span className="font-normal text-slate-400"> · {t('finishes.default')}</span>
              )}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-slate-400 transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
        <IconButton
          label={t('finishes.copy')}
          disabled={!instance}
          onClick={() => {
            if (instance) setClipboard(instance.id);
          }}
        >
          <Copy className="size-4" />
        </IconButton>
        <IconButton
          label={t('finishes.paste')}
          disabled={!clipboard || !project.materials.some((m) => m.id === clipboard)}
          onClick={() => {
            if (clipboard)
              run(applyMaterial, { levelId, targets, material: { materialId: clipboard } });
          }}
          data-testid={`${testId}-paste`}
        >
          <ClipboardPaste className="size-4" />
        </IconButton>
      </div>

      {open && (
        <ul className="grid grid-cols-2 gap-1" data-testid={`${testId}-options`}>
          {options.map((def) => {
            const active = def.id === definition.id && !mixed;
            const name = localize(def.name, i18n.language);
            return (
              <li key={def.id}>
                <button
                  type="button"
                  onClick={() => choose(def)}
                  aria-pressed={active}
                  data-testid={`${testId}-option-${def.id}`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border p-1.5 text-left text-xs transition-colors',
                    active
                      ? 'border-brand-400 bg-brand-50 text-brand-800'
                      : 'border-slate-200 text-slate-700 hover:border-brand-300',
                  )}
                >
                  <MaterialSwatch material={resolveMaterial(def)} size={28} />
                  <span className="min-w-0 flex-1 leading-tight">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!mixed && (
        <div className="flex flex-col gap-3 px-1 pb-1">
          {definition.tintable && (
            <ColorField
              label={t('finishes.color')}
              value={resolved.color}
              swatches={colors}
              onCommit={(tint) => edit({ tint })}
              testId={`${testId}-color`}
            />
          )}
          {Object.entries(definition.params).map(([key, spec]) => (
            <ParamField
              key={key}
              name={`${testId}-${key}`}
              spec={spec}
              value={resolved.params[key]!}
              onCommit={(value) => edit({ params: { [key]: value } })}
            />
          ))}
          {definition.pattern !== 'plain' && (
            <div className="grid grid-cols-2 gap-2">
              <ParamField
                name={`${testId}-scale`}
                spec={scaleParam}
                value={Math.round(resolved.scale * 100)}
                onCommit={(value) => edit({ scale: Number(value) / 100 })}
              />
              <ParamField
                name={`${testId}-rotation`}
                spec={rotationParam}
                value={resolved.rotation}
                onCommit={(value) => edit({ rotation: Number(value) })}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {sharedElsewhere && (
              <>
                <span className="flex items-center gap-1">
                  <Pipette className="size-3.5" aria-hidden />
                  {t('finishes.shared', { count: usage })}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1 font-medium text-brand-600 hover:underline"
                  onClick={detach}
                  data-testid={`${testId}-detach`}
                >
                  <Unlink className="size-3.5" aria-hidden />
                  {t('finishes.detach')}
                </button>
              </>
            )}
            {instance && (
              <button
                type="button"
                className="flex items-center gap-1 hover:text-slate-800"
                onClick={() => run(clearMaterial, { levelId, targets })}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t('finishes.reset')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
