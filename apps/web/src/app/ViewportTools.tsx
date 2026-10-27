import { formatLength } from '@decodeny/domain';
import { measureDistance, type ItemGroup, type ViewerApi } from '@decodeny/viewer';
import { Camera, Layers, Moon, Ruler, Scissors, Sun, X } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadCapture } from '@/features/io/project-actions';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/Button';
import { LengthField } from '@/shared/ui/LengthField';
import { DEFAULT_SECTION_HEIGHT, useUiStore } from '@/state/ui-store';

const GROUPS: readonly {
  id: ItemGroup;
  label: 'viewport.layerFurniture' | 'viewport.layerDecor' | 'viewport.layerLighting';
}[] = [
  { id: 'furniture', label: 'viewport.layerFurniture' },
  { id: 'decor', label: 'viewport.layerDecor' },
  { id: 'lighting', label: 'viewport.layerLighting' },
];

/** Herramientas de la vista: capas, corte, medición, día/noche y captura. */
export function ViewportTools({ viewerRef }: { readonly viewerRef: RefObject<ViewerApi | null> }) {
  const { t } = useTranslation();
  const mode = useUiStore((s) => s.navigationMode);
  const lighting = useUiStore((s) => s.lighting);
  const setLighting = useUiStore((s) => s.setLighting);
  const hidden = useUiStore((s) => s.hiddenGroups);
  const toggleGroup = useUiStore((s) => s.toggleGroup);
  const section = useUiStore((s) => s.sectionHeight);
  const setSection = useUiStore((s) => s.setSectionHeight);
  const measuring = useUiStore((s) => s.measuring);
  const setMeasuring = useUiStore((s) => s.setMeasuring);
  const [layersOpen, setLayersOpen] = useState(false);
  const plan = useUiStore((s) => s.view) === 'plan';
  // El corte y la iluminación son de la vista 3D; la medición, de ambas (en edición).
  const edit = mode === 'edit' && !plan;

  return (
    <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
      {layersOpen && (
        <div
          className="flex w-56 flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-lg backdrop-blur"
          data-testid="layers-panel"
        >
          {GROUPS.map(({ id, label }) => (
            <label key={id} className="flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={!hidden.has(id)}
                onChange={() => toggleGroup(id)}
                data-testid={`layer-${id}`}
              />
              {t(label)}
            </label>
          ))}
          {edit && (
            <div className="mt-1 flex flex-col gap-2 border-t border-slate-200 pt-2">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={section !== null}
                  onChange={(e) => setSection(e.target.checked ? DEFAULT_SECTION_HEIGHT : null)}
                  data-testid="layer-section"
                />
                <Scissors className="size-3.5 text-slate-400" aria-hidden />
                {t('viewport.section')}
              </label>
              {section !== null && (
                <LengthField
                  label={t('viewport.sectionHeight')}
                  value={section}
                  min={100}
                  max={10_000}
                  step={100}
                  onCommit={setSection}
                  testId="section-height"
                />
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        {mode === 'edit' && (
          <IconButton
            label={t('viewport.measure')}
            aria-pressed={measuring}
            className={cn(measuring && 'bg-pink-100 text-pink-700')}
            onClick={() => setMeasuring(!measuring)}
            data-testid="toggle-measure"
          >
            <Ruler className="size-4" />
          </IconButton>
        )}
        <IconButton
          label={t('viewport.layers')}
          aria-pressed={layersOpen}
          className={cn((hidden.size > 0 || section !== null) && 'text-brand-600')}
          onClick={() => setLayersOpen((v) => !v)}
          data-testid="toggle-layers"
        >
          <Layers className="size-4" />
        </IconButton>
        {!plan && (
          <IconButton
            label={t(lighting === 'day' ? 'viewport.night' : 'viewport.day')}
            aria-pressed={lighting === 'night'}
            onClick={() => setLighting(lighting === 'day' ? 'night' : 'day')}
            data-testid="toggle-lighting"
          >
            {lighting === 'day' ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </IconButton>
        )}
        <IconButton
          label={t('viewport.capture')}
          onClick={() => {
            const api = viewerRef.current;
            if (api) void downloadCapture(() => api.captureImage(2));
          }}
          data-testid="capture"
        >
          <Camera className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/** Resultado de la medición: distancia total y sus componentes. */
export function MeasurePanel() {
  const { t, i18n } = useTranslation();
  const measuring = useUiStore((s) => s.measuring);
  const points = useUiStore((s) => s.measurePoints);
  const setMeasuring = useUiStore((s) => s.setMeasuring);
  if (!measuring) return null;
  const [a, b] = points;
  const fmt = (mm: number) => formatLength(mm, i18n.language);
  return (
    <div
      className="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-pink-200 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur"
      data-testid="measure-panel"
    >
      <Ruler className="size-4 text-pink-600" aria-hidden />
      {a && b ? (
        <dl className="flex items-baseline gap-3 tabular-nums">
          <div>
            <dt className="sr-only">{t('viewport.measureDistance')}</dt>
            <dd className="text-base font-semibold text-slate-900" data-testid="measure-distance">
              {fmt(measureDistance(a, b))}
            </dd>
          </div>
          <div className="text-xs text-slate-500">
            <dt className="inline">{t('viewport.measureHorizontal')}: </dt>
            <dd className="inline">{fmt(Math.hypot(b.x - a.x, b.y - a.y))}</dd>
          </div>
          <div className="text-xs text-slate-500">
            <dt className="inline">{t('viewport.measureVertical')}: </dt>
            <dd className="inline">{fmt(Math.abs(b.z - a.z))}</dd>
          </div>
        </dl>
      ) : (
        <span className="text-slate-600">{t('viewport.measureHint')}</span>
      )}
      <IconButton label={t('viewport.measureClose')} onClick={() => setMeasuring(false)}>
        <X className="size-4" />
      </IconButton>
    </div>
  );
}
