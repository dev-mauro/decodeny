import type { ResolvedMaterial } from '@decodeny/domain';
import { paintMaterial } from '@decodeny/viewer';
import { useEffect, useRef } from 'react';
import { cn } from '@/shared/lib/cn';

/** Resolución máxima del patrón en las muestras (rápido de calcular). */
const PREVIEW_PX = 160;

interface MaterialSwatchProps {
  readonly material: ResolvedMaterial;
  /** Área física que representa la muestra (mm por lado). */
  readonly areaMm?: number;
  readonly size?: number;
  readonly className?: string;
}

/** Muestra de un material a escala: el mismo patrón que se ve en la vista 3D. */
export function MaterialSwatch({
  material,
  areaMm = 1200,
  size = 40,
  className,
}: MaterialSwatchProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const image = paintMaterial(material, PREVIEW_PX);
    const tile = document.createElement('canvas');
    tile.width = image.width;
    tile.height = image.height;
    tile
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
        0,
        0,
      );
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    // `areaMm` ocupan todo el lienzo; la escala del material agranda o achica el patrón.
    const pxPerMm = (size * dpr * material.scale) / areaMm;
    pattern.setTransform(
      new DOMMatrix()
        .rotate(material.rotation)
        .scale(
          (image.sizeMm[0] * pxPerMm) / image.width,
          (image.sizeMm[1] * pxPerMm) / image.height,
        ),
    );
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [areaMm, material, size]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn('shrink-0 rounded-md border border-slate-200 shadow-inner', className)}
      style={{ width: size, height: size }}
    />
  );
}
