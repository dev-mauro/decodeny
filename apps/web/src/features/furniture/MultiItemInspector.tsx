import { resolveItemDefinition } from '@decodeny/catalog';
import { localize, type Item } from '@decodeny/domain';
import { Copy, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { Button, IconButton } from '@/shared/ui/Button';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { itemIcon } from './item-icons';
import { deleteSelectedItems, duplicateSelectedItems, rotateSelectedItems } from './item-actions';

/** Propiedades de una selección múltiple de muebles: lista y acciones sobre todos. */
export function MultiItemInspector({ items }: { readonly items: readonly Item[] }) {
  const { t, i18n } = useTranslation();
  const touch = useCoarsePointer();
  const select = useUiStore((s) => s.select);

  const remove = () => {
    if (!deleteSelectedItems()) return;
    notify('info', t('furniture.deletedMany', { count: items.length }), {
      label: t('notifications.undo'),
      run: () => useProjectStore.getState().undo(),
    });
  };

  return (
    <div className="flex flex-col gap-5" data-testid="multi-item-inspector">
      <p className="text-xs text-slate-500">
        {t(touch ? 'furniture.multiHintTouch' : 'furniture.multiHint')}
      </p>
      <ul className="flex flex-col gap-0.5" data-testid="multi-item-list">
        {items.map((item) => {
          const definition = resolveItemDefinition(item.def);
          const Icon = itemIcon(definition);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select({ kind: 'item', id: item.id })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {localize(definition.name, i18n.language)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{t('furniture.rotation')}</span>
        <IconButton label={t('furniture.rotateLeft')} onClick={() => rotateSelectedItems(90)}>
          <RotateCcw className="size-4" />
        </IconButton>
        <IconButton label={t('furniture.rotateRight')} onClick={() => rotateSelectedItems(-90)}>
          <RotateCw className="size-4" />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          icon={<Copy className="size-4" />}
          onClick={duplicateSelectedItems}
          data-testid="duplicate-items"
        >
          {t('furniture.duplicate')}
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={remove}
          data-testid="delete-items"
        >
          {t('furniture.delete')}
        </Button>
      </div>
    </div>
  );
}
