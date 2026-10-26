/** Capas de items que se pueden ocultar: muebles, decoración y luminarias. */
export type ItemGroup = 'furniture' | 'decor' | 'lighting';

export const itemGroupOf = (category: string): ItemGroup =>
  category === 'decor' ? 'decor' : category === 'lighting' ? 'lighting' : 'furniture';
