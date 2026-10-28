/**
 * Capas de items: muebles, decoración y luminarias se pueden ocultar; la estructura (escaleras)
 * no tiene interruptor y siempre se ve.
 */
export type ItemGroup = 'furniture' | 'decor' | 'lighting' | 'structure';

export const itemGroupOf = (category: string): ItemGroup =>
  category === 'decor'
    ? 'decor'
    : category === 'lighting'
      ? 'lighting'
      : category === 'stairs'
        ? 'structure'
        : 'furniture';
