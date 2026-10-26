import { materialCatalog, resolveMaterialDefinition } from '@decodeny/catalog';
import { resolveMaterial } from '@decodeny/domain';
import { describe, expect, it } from 'vitest';
import { hexToRgb, paintMaterial, patternField, patternPainters, SEAM } from './patterns';

describe('patrones de materiales', () => {
  it.each(materialCatalog.list().map((m) => [m.id, m] as const))(
    '%s tiene pintor y genera una imagen válida',
    (_, def) => {
      expect(patternPainters.has(def.pattern)).toBe(true);
      const img = paintMaterial(resolveMaterial(def));
      expect(img.width).toBeGreaterThanOrEqual(8);
      expect(img.height).toBeGreaterThanOrEqual(8);
      expect(img.width).toBeLessThanOrEqual(1100);
      expect(img.data).toHaveLength(img.width * img.height * 4);
      expect(img.sizeMm[0]).toBeGreaterThan(0);
      expect(img.sizeMm[1]).toBeGreaterThan(0);
    },
  );

  it('una baldosa de 60 × 60 cubre exactamente su medida más el fragüe', () => {
    const def = resolveMaterialDefinition('floor.porcelain@1');
    const img = paintMaterial(resolveMaterial(def, { params: { joint: 2 } }));
    // Dos baldosas por lado para que la textura se repita sin costuras.
    expect(img.sizeMm).toEqual([1204, 1204]);
  });

  it('el color de la instancia se hornea en la textura', () => {
    const def = resolveMaterialDefinition('wall.paint-matte@1');
    const img = paintMaterial(resolveMaterial(def, { tint: '#204060' }));
    const [r, g, b] = hexToRgb('#204060');
    expect(Math.abs(img.data[0]! - r)).toBeLessThanOrEqual(4);
    expect(Math.abs(img.data[1]! - g)).toBeLessThanOrEqual(4);
    expect(Math.abs(img.data[2]! - b)).toBeLessThanOrEqual(4);
  });

  it('la espiga cubre toda la superficie con tablas (sin huecos)', () => {
    const def = resolveMaterialDefinition('floor.herringbone@1');
    const img = paintMaterial(resolveMaterial(def, { tint: '#c08040' }));
    const seam = hexToRgb('#c08040').map((c) => Math.floor(c * SEAM));
    let seamPixels = 0;
    for (let k = 0; k < img.data.length; k += 4) {
      if (
        Math.abs(img.data[k]! - seam[0]!) <= 1 &&
        Math.abs(img.data[k + 1]! - seam[1]!) <= 1 &&
        Math.abs(img.data[k + 2]! - seam[2]!) <= 1
      ) {
        seamPixels++;
      }
    }
    // Solo las juntas (≈1 mm de cada tabla de 70 mm) tienen el color de junta.
    expect(seamPixels / (img.data.length / 4)).toBeLessThan(0.08);
  });

  it('cambiar el color reutiliza el patrón y es instantáneo (< 16 ms)', () => {
    const def = resolveMaterialDefinition('floor.herringbone@1');
    const field = patternField(resolveMaterial(def));
    expect(patternField(resolveMaterial(def, { tint: '#123456' }))).toBe(field);
    const start = performance.now();
    paintMaterial(resolveMaterial(def, { tint: '#654321' }));
    expect(performance.now() - start).toBeLessThan(16);
  });

  it('los colores de fragüe y diseño respetan los parámetros', () => {
    const def = resolveMaterialDefinition('wall.tile@1');
    const img = paintMaterial(resolveMaterial(def, { params: { joint: 20, grout: '#ff0000' } }));
    // La esquina (0, 0) cae en la junta.
    expect([img.data[0], img.data[1], img.data[2]]).toEqual([255, 0, 0]);
  });
});
