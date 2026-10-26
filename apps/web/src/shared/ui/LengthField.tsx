import { formatMetersValue, parseLength } from '@decodeny/domain';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { NumericField, type NumericFieldProps } from './NumericField';

type LengthFieldProps = Omit<
  NumericFieldProps,
  'parse' | 'format' | 'invalidMessage' | 'validate' | 'suffix' | 'step'
> & {
  /** Mínimo en mm. */
  readonly min?: number;
  /** Máximo en mm. */
  readonly max?: number;
  /** Paso de las flechas en mm (por defecto 1 cm). */
  readonly step?: number;
};

const parseMm = (text: string): number | null => {
  const r = parseLength(text);
  return r.ok ? r.value : null;
};

/** Campo de longitud: muestra metros con coma decimal y guarda milímetros. */
export function LengthField({ min, max, step = 10, ...rest }: LengthFieldProps) {
  const { t, i18n } = useTranslation();
  const format = useCallback((mm: number) => formatMetersValue(mm, i18n.language), [i18n.language]);
  const validate = useCallback(
    (mm: number) => {
      const tooLow = min !== undefined && mm < min;
      const tooHigh = max !== undefined && mm > max;
      if (!tooLow && !tooHigh) return null;
      if (max === undefined) return t('field.min', { min: `${format(min!)} m` });
      return t('field.range', { min: `${format(min ?? 0)} m`, max: `${format(max)} m` });
    },
    [format, max, min, t],
  );

  return (
    <NumericField
      {...rest}
      parse={parseMm}
      format={format}
      validate={validate}
      invalidMessage={t('field.invalidLength')}
      suffix={t('field.unitMeters')}
      step={step}
    />
  );
}
