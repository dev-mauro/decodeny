import { openingCatalog, resolveOpeningDefinition } from '@decodeny/catalog';
import {
  addOpening,
  defaultParams,
  formatLength,
  localize,
  openingEnvelope,
  openingsOfWall,
  type AnyOpeningDefinition,
  type Level,
  type Wall,
  type WallFace,
} from '@decodeny/domain';
import { AppWindow, DoorOpen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';

interface WallOpeningsProps {
  readonly level: Level;
  readonly wall: Wall;
  /** Cara del muro hacia el recinto de contexto: las puertas nuevas abren hacia él. */
  readonly contextFace: WallFace | null;
}

const ICONS = { door: DoorOpen, window: AppWindow } as const;

/** Parámetros iniciales: los del catálogo, con las puertas abriendo hacia el recinto actual. */
function initialParams(def: AnyOpeningDefinition, face: WallFace | null) {
  const params: Record<string, number | string | boolean> = { ...defaultParams(def.params) };
  if (face) {
    for (const [key, spec] of Object.entries(def.params)) {
      if (spec.kind === 'choice' && spec.semantic === 'wall-face') params[key] = face;
    }
  }
  return params;
}

/** Puertas y ventanas de un muro: lista y catálogo para agregar. */
export function WallOpenings({ level, wall, contextFace }: WallOpeningsProps) {
  const { t, i18n } = useTranslation();
  const run = useCommand();
  const select = useUiStore((s) => s.select);
  const setHighlighted = useUiStore((s) => s.setHighlighted);
  const openings = openingsOfWall(level, wall.id);
  const catalog = openingCatalog.list();

  const add = (def: AnyOpeningDefinition) => {
    const out = run(addOpening, {
      levelId: level.id,
      wallId: wall.id,
      def: def.id,
      params: initialParams(def, contextFace),
    });
    if (out.ok) select({ kind: 'opening', id: out.result.openingId });
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby="wall-openings-title">
      <h3
        id="wall-openings-title"
        className="text-xs font-semibold tracking-wide text-slate-400 uppercase"
      >
        {t('openings.title')}
      </h3>
      {openings.length === 0 ? (
        <p className="text-sm text-slate-500">{t('openings.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="wall-openings">
          {openings.map((opening) => {
            const def = resolveOpeningDefinition(opening.def);
            const Icon = ICONS[def.kind];
            return (
              <li key={opening.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => select({ kind: 'opening', id: opening.id })}
                  onMouseEnter={() => setHighlighted([{ kind: 'opening', id: opening.id }])}
                  onMouseLeave={() => setHighlighted([])}
                >
                  <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {localize(def.name, i18n.language)}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {formatLength(openingEnvelope(opening).width, i18n.language)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-1 text-xs font-medium text-slate-500">{t('openings.add')}</p>
      {(['door', 'window'] as const).map((kind) => (
        <div key={kind} className="flex flex-col gap-1">
          <p className="text-[11px] text-slate-400">
            {t(kind === 'door' ? 'openings.doors' : 'openings.windows')}
          </p>
          <div className="grid grid-cols-2 gap-1" data-testid={`catalog-${kind}s`}>
            {catalog
              .filter((d) => d.kind === kind)
              .map((def) => {
                const Icon = ICONS[kind];
                const name = localize(def.name, i18n.language);
                return (
                  <button
                    key={def.id}
                    type="button"
                    title={def.description ? localize(def.description, i18n.language) : name}
                    aria-label={t('openings.addItem', { name })}
                    onClick={() => add(def)}
                    data-testid={`add-${def.id}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <Plus className="size-3 shrink-0 text-slate-400" aria-hidden />
                    <Icon className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
