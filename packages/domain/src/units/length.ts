/**
 * Longitudes del documento: **milímetros enteros** (ver ADR-002).
 * La conversión a metros ocurre solo en los bordes (UI y visor 3D).
 */
export type Millimeters = number;

export const MM_PER_METER = 1000;

export const mmToMeters = (mm: Millimeters): number => mm / MM_PER_METER;
export const metersToMm = (m: number): Millimeters => Math.round(m * MM_PER_METER);

export type LengthParseError = 'empty' | 'invalid';
export type LengthParseResult =
  | { readonly ok: true; readonly value: Millimeters }
  | { readonly ok: false; readonly error: LengthParseError };

const UNIT_FACTORS = { mm: 1, cm: 10, m: 1000 } as const;
const LENGTH_PATTERN = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(mm|cm|m)?$/;

/**
 * Interpreta una longitud escrita por el usuario.
 * Un número sin unidad se interpreta en **metros** ("4,2" → 4200 mm), que es como los
 * corredores expresan medidas. Acepta coma o punto decimal y sufijos `m`, `cm`, `mm`.
 */
export function parseLength(input: string): LengthParseResult {
  const normalized = input.trim().toLowerCase();
  if (normalized === '') return { ok: false, error: 'empty' };
  const match = LENGTH_PATTERN.exec(normalized);
  if (!match?.[1]) return { ok: false, error: 'invalid' };
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount)) return { ok: false, error: 'invalid' };
  const unit = (match[2] ?? 'm') as keyof typeof UNIT_FACTORS;
  return { ok: true, value: Math.round(amount * UNIT_FACTORS[unit]) };
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, decimals: number): Intl.NumberFormat {
  const key = `${locale}|${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: false,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Valor numérico en metros, sin unidad: 4200 → "4,20". */
export function formatMetersValue(mm: Millimeters, locale = 'es', decimals = 2): string {
  return formatter(locale, decimals).format(mmToMeters(mm));
}

/** Longitud legible: 4200 → "4,20 m". */
export function formatLength(mm: Millimeters, locale = 'es', decimals = 2): string {
  return `${formatMetersValue(mm, locale, decimals)} m`;
}

/** Área legible a partir de mm²: 12_500_000 → "12,50 m²". */
export function formatArea(mm2: number, locale = 'es', decimals = 2): string {
  return `${formatter(locale, decimals).format(mm2 / (MM_PER_METER * MM_PER_METER))} m²`;
}
