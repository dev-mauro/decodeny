import { formatLength } from '@decodeny/domain';
import type { SectionMode } from '@decodeny/viewer';
import { Grid3x3, Lock, Scissors, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LengthField } from '@/shared/ui/LengthField';
import { MenuButton } from '@/shared/ui/MenuButton';
import { useProjectStore } from '@/state/project-store';
import { DEFAULT_SECTION_HEIGHT, GRID_STEPS, useUiStore, type GridStep } from '@/state/ui-store';
import { LanguageSwitch } from './LanguageSwitch';

/** Opciones de la aplicación: idioma, corte de muros, cuadrícula y solo lectura. */
export function OptionsMenu() {
  const { t, i18n } = useTranslation();
  const section = useUiStore((s) => s.sectionHeight);
  const setSection = useUiStore((s) => s.setSectionHeight);
  const sectionMode = useUiStore((s) => s.sectionMode);
  const setSectionMode = useUiStore((s) => s.setSectionMode);
  const grid = useUiStore((s) => s.grid);
  const setGrid = useUiStore((s) => s.setGrid);
  const readOnly = useProjectStore((s) => s.readOnly);
  const setReadOnly = useProjectStore((s) => s.setReadOnly);
  const row = 'flex items-center gap-2 text-sm text-slate-700';

  return (
    <MenuButton
      label={t('options.title')}
      icon={<Settings2 className="size-4" />}
      testId="options"
      panelClassName="w-72 gap-3 p-3"
    >
      {() => (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">{t('options.language')}</span>
            <LanguageSwitch />
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className={row}>
              <input
                type="checkbox"
                checked={section !== null}
                onChange={(e) => setSection(e.target.checked ? DEFAULT_SECTION_HEIGHT : null)}
                data-testid="option-section"
              />
              <Scissors className="size-3.5 text-slate-400" aria-hidden />
              {t('viewport.section')}
            </label>
            {section !== null && (
              <>
                <LengthField
                  label={t('viewport.sectionHeight')}
                  value={section}
                  min={100}
                  max={10_000}
                  step={100}
                  onCommit={setSection}
                  testId="section-height"
                />
                <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  {t('viewport.sectionMode')}
                  <select
                    className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-sm text-slate-700"
                    value={sectionMode}
                    onChange={(e) => setSectionMode(e.target.value as SectionMode)}
                    data-testid="option-section-mode"
                  >
                    <option value="all">{t('viewport.sectionAll')}</option>
                    <option value="facing">{t('viewport.sectionFacing')}</option>
                  </select>
                </label>
                {sectionMode === 'facing' && (
                  <p className="text-xs text-slate-500">{t('viewport.sectionFacingHint')}</p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <label className={row}>
              <input
                type="checkbox"
                checked={grid.enabled}
                onChange={(e) => setGrid({ enabled: e.target.checked })}
                data-testid="option-grid"
              />
              <Grid3x3 className="size-3.5 text-slate-400" aria-hidden />
              {t('options.grid')}
            </label>
            {grid.enabled && (
              <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
                {t('options.gridStep')}
                <select
                  className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-sm text-slate-700"
                  value={grid.step}
                  onChange={(e) => setGrid({ step: Number(e.target.value) as GridStep })}
                  data-testid="option-grid-step"
                >
                  {GRID_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step < 1000 ? `${step / 10} cm` : formatLength(step, i18n.language, 0)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {grid.enabled && <p className="text-xs text-slate-500">{t('options.gridHint')}</p>}
          </div>

          <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
            <label className={row}>
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
                data-testid="option-read-only"
              />
              <Lock className="size-3.5 text-slate-400" aria-hidden />
              {t('options.readOnly')}
            </label>
            <p className="text-xs text-slate-500">{t('options.readOnlyHint')}</p>
          </div>
        </>
      )}
    </MenuButton>
  );
}
