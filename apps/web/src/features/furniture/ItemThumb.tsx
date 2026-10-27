import type { AnyItemDefinition } from '@decodeny/domain';
import { itemThumbnail, THUMBNAIL_SIZE } from '@decodeny/viewer';
import { createElement, useEffect, useState } from 'react';
import { itemIcon } from './item-icons';

/** Miniatura del mueble (generada desde su definición) o, mientras tanto, su ícono. */
export function ItemThumb({ definition }: { readonly definition: AnyItemDefinition }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void itemThumbnail(definition).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [definition]);

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={THUMBNAIL_SIZE}
        height={THUMBNAIL_SIZE}
        className="size-10 shrink-0 rounded-md bg-slate-50 object-contain"
        data-testid={`catalog-thumb-${definition.id}`}
      />
    );
  }
  // `itemIcon` devuelve componentes estables del módulo de íconos.
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-50">
      {createElement(itemIcon(definition), {
        className: 'size-4 text-slate-400 group-hover:text-brand-500',
        'aria-hidden': true,
      })}
    </span>
  );
}
