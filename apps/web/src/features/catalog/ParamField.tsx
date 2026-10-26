import {
  localize,
  roomOnWallFace,
  type ChoiceParamSpec,
  type Level,
  type ParamSpec,
  type WallFace,
} from '@decodeny/domain';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { LengthField } from '@/shared/ui/LengthField';
import { NumericField } from '@/shared/ui/NumericField';
import { ImageField } from './ImageField';

/** Contexto de un vano: da significado a las opciones `wall-face` y `wall-end`. */
export interface ParamContext {
  readonly level: Level;
  readonly wallId: string;
  /** Cara desde la que se miran las medidas: define izquierda/derecha. */
  readonly viewFace: WallFace;
}

interface ParamFieldProps {
  readonly name: string;
  readonly spec: ParamSpec;
  readonly value: number | string | boolean;
  readonly context?: ParamContext | undefined;
  readonly onCommit: (value: number | string | boolean) => void;
  /** Para parámetros de imagen: el usuario eligió un archivo. */
  readonly onImage?: ((file: File) => void) | undefined;
}

const UNIT_KEYS = { deg: 'field.unitDegrees', percent: 'field.unitPercent' } as const;

/** Longitudes con máximo hasta 10 cm se muestran en mm. */
const SMALL_LENGTH_MAX = 100;

/**
 * Campo de un parámetro de catálogo. La UI de propiedades se genera desde la definición:
 * un tipo nuevo de puerta o ventana no necesita formularios propios (ADR-0004).
 */
export function ParamField({ name, spec, value, context, onCommit, onImage }: ParamFieldProps) {
  const { t, i18n } = useTranslation();
  const label = localize(spec.label, i18n.language);
  const testId = `param-${name}`;

  switch (spec.kind) {
    case 'length':
      // Medidas pequeñas (fragüe, juntas) se editan en milímetros: en metros se verían "0,00".
      if (spec.max <= SMALL_LENGTH_MAX) {
        return (
          <NumericField
            label={label}
            value={Number(value)}
            parse={(text) => {
              const n = Number(text.replace(',', '.').replace(/mm$/i, '').trim());
              return text.trim() !== '' && Number.isFinite(n) ? Math.round(n) : null;
            }}
            format={(n) => String(Math.round(n))}
            invalidMessage={t('field.invalidNumber')}
            validate={(n) =>
              n < spec.min || n > spec.max
                ? t('field.range', { min: spec.min, max: spec.max })
                : null
            }
            suffix={t('field.unitMillimeters')}
            step={1}
            onCommit={onCommit}
            testId={testId}
          />
        );
      }
      return (
        <LengthField
          label={label}
          value={Number(value)}
          min={spec.min}
          max={spec.max}
          {...(spec.step !== undefined ? { step: spec.step } : {})}
          onCommit={onCommit}
          testId={testId}
        />
      );
    case 'number': {
      const integer = spec.unit === 'count' || Number.isInteger(spec.step ?? 1);
      return (
        <NumericField
          label={label}
          value={Number(value)}
          parse={(text) => {
            const n = Number(text.replace(',', '.').trim());
            return text.trim() !== '' && Number.isFinite(n) ? n : null;
          }}
          format={(n) => (integer ? String(Math.round(n)) : n.toLocaleString(i18n.language))}
          invalidMessage={t('field.invalidNumber')}
          validate={(n) =>
            n < spec.min || n > spec.max ? t('field.range', { min: spec.min, max: spec.max }) : null
          }
          {...(spec.unit && spec.unit !== 'count' ? { suffix: t(UNIT_KEYS[spec.unit]) } : {})}
          step={spec.step ?? 1}
          onCommit={(n) => onCommit(integer ? Math.round(n) : n)}
          testId={testId}
        />
      );
    }
    case 'choice':
      return (
        <ChoiceField
          label={label}
          spec={spec}
          value={String(value)}
          context={context}
          onCommit={onCommit}
          testId={testId}
        />
      );
    case 'color':
      return <ColorField label={label} value={String(value)} onCommit={onCommit} testId={testId} />;
    case 'image':
      return (
        <ImageField
          label={label}
          assetId={String(value)}
          onFile={(file) => onImage?.(file)}
          onClear={() => onCommit('')}
          testId={testId}
        />
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onCommit(e.target.checked)}
            data-testid={testId}
          />
          {label}
        </label>
      );
  }
}

function ChoiceField({
  label,
  spec,
  value,
  context,
  onCommit,
  testId,
}: {
  readonly label: string;
  readonly spec: ChoiceParamSpec;
  readonly value: string;
  readonly context: ParamContext | undefined;
  readonly onCommit: (value: string) => void;
  readonly testId: string;
}) {
  const { t, i18n } = useTranslation();
  // Desde la cara `left` del muro, su extremo `end` queda a la izquierda (y viceversa).
  const leftEnd = context?.viewFace === 'left' ? 'end' : 'start';
  const optionLabel = (option: ChoiceParamSpec['options'][number]) => {
    if (!context) return localize(option.label, i18n.language);
    if (spec.semantic === 'wall-face') {
      const room = roomOnWallFace(context.level, context.wallId, option.value as WallFace);
      return room ? t('openings.toward', { room: room.name }) : t('openings.outside');
    }
    if (spec.semantic === 'wall-end') {
      return option.value === leftEnd ? t('openings.leftEnd') : t('openings.rightEnd');
    }
    return localize(option.label, i18n.language);
  };
  // Izquierda antes que derecha, como se ven.
  const options =
    context && spec.semantic === 'wall-end'
      ? [...spec.options].sort((a, b) => Number(b.value === leftEnd) - Number(a.value === leftEnd))
      : spec.options;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-slate-500">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-lg bg-slate-100 p-0.5"
        data-testid={testId}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onCommit(option.value)}
              className={cn(
                'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {optionLabel(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Color con selector nativo; aplica al soltar el selector (no en cada movimiento). */
export function ColorField({
  label,
  value,
  onCommit,
  testId,
  swatches = [],
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly testId?: string;
  readonly swatches?: readonly string[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="color"
          aria-label={label}
          className="h-8 w-10 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5"
          value={value}
          onChange={(e) => onCommit(e.target.value)}
          data-testid={testId}
        />
        {swatches.slice(0, 12).map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={`${label}: ${color}`}
            aria-pressed={color === value}
            onClick={() => onCommit(color)}
            className={cn(
              'size-6 rounded-md border shadow-inner transition-transform hover:scale-110',
              color === value ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-300',
            )}
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  );
}
