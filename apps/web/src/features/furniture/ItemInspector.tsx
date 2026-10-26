import {
  itemBase,
  itemCatalog,
  itemEnvelope,
  resolveItemDefinition,
  unknownItem,
} from '@decodeny/catalog';
import {
  deleteItems,
  itemWarnings,
  localize,
  resolveParams,
  roomOfItem,
  updateItem,
  type Item,
  type Level,
} from '@decodeny/domain';
import { Copy, Move, RotateCcw, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ParamField } from '@/features/catalog/ParamField';
import { Button, IconButton } from '@/shared/ui/Button';
import { LengthField } from '@/shared/ui/LengthField';
import { NumericField } from '@/shared/ui/NumericField';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { useCommand } from '@/state/use-command';
import { setItemImage } from '@/features/assets/image-actions';
import { duplicateSelectedItem } from './item-actions';

interface ItemInspectorProps {
  readonly level: Level;
  readonly item: Item;
}

/** Propiedades de un mueble, generadas desde su definición de catálogo. */
export function ItemInspector({ level, item }: ItemInspectorProps) {
  const { t, i18n } = useTranslation();
  const run = useCommand();
  const select = useUiStore((s) => s.select);
  const ref = { levelId: level.id, itemId: item.id };
  const definition = resolveItemDefinition(item.def);
  const known = definition !== unknownItem;
  const params = resolveParams(definition.params, item.params);
  const entries = Object.entries(definition.params);
  const basic = entries.filter(([, spec]) => !spec.advanced);
  const advanced = entries.filter(([, spec]) => spec.advanced);
  const sameCategory = itemCatalog.list().filter((d) => d.category === definition.category);

  const { warning, room } = useMemo(
    () => ({
      warning: itemWarnings(level, itemEnvelope, (i) => itemBase(level, i)).get(item.id),
      room: roomOfItem(level, item),
    }),
    [item, level],
  );

  const commitParam = (key: string, value: number | string | boolean) =>
    run(updateItem, { ...ref, params: { [key]: value } }, { coalesceKey: `ip:${item.id}:${key}` });
  const rotate = (rotation: number) =>
    run(updateItem, { ...ref, rotation }, { coalesceKey: `rot:${item.id}` });

  const remove = () => {
    const name = localize(definition.name, i18n.language);
    const out = run(deleteItems, { levelId: level.id, itemIds: [item.id] });
    if (out.ok) {
      notify('info', t('furniture.deleted', { name }), {
        label: t('notifications.undo'),
        run: () => useProjectStore.getState().undo(),
      });
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="item-inspector">
      {!known && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          {t('furniture.unknown', { def: item.def })}
        </p>
      )}
      {warning && (
        <p
          role="status"
          className="flex gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700"
          data-testid="item-warning"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(warning === 'wall' ? 'furniture.warningWall' : 'furniture.warningOverlap')}
        </p>
      )}

      {known && sameCategory.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">{t('furniture.type')}</span>
          <select
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            value={item.def}
            onChange={(e) => run(updateItem, { ...ref, def: e.target.value })}
            data-testid="item-type"
          >
            {sameCategory.map((d) => (
              <option key={d.id} value={d.id}>
                {localize(d.name, i18n.language)}
              </option>
            ))}
          </select>
        </label>
      )}

      {room && (
        <p className="text-sm text-slate-500">
          {t('furniture.inRoom')}{' '}
          <button
            type="button"
            className="font-medium text-brand-600 hover:underline"
            onClick={() => select({ kind: 'room', id: room.id })}
          >
            {room.name}
          </button>
        </p>
      )}

      {definition.presets && definition.presets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-slate-500">{t('furniture.presets')}</p>
          <div className="flex flex-wrap gap-1" data-testid="item-presets">
            {definition.presets.map((preset) => {
              const name = localize(preset.name, i18n.language);
              const active = Object.entries(preset.params).every(([k, v]) => params[k] === v);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => run(updateItem, { ...ref, params: preset.params })}
                  className={
                    active
                      ? 'rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-xs text-brand-700'
                      : 'rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50'
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {basic.map(([key, spec]) => (
          <ParamField
            key={key}
            name={key}
            spec={spec}
            value={params[key]!}
            onCommit={(value) => commitParam(key, value)}
            onImage={(file) => {
              const size = (k: string) => {
                const v = params[k];
                return typeof v === 'number' ? v : 0;
              };
              void setItemImage(level.id, item.id, key, file, {
                width: size('width'),
                frame: size('frame'),
                mat: size('mat'),
              });
            }}
          />
        ))}
      </div>

      {advanced.length > 0 && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {t('openings.advanced')}
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {advanced.map(([key, spec]) => (
              <ParamField
                key={key}
                name={key}
                spec={spec}
                value={params[key]!}
                onCommit={(value) => commitParam(key, value)}
              />
            ))}
          </div>
        </details>
      )}

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {t('furniture.placement')}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            label={t('inspector.positionX')}
            value={item.position.x}
            step={100}
            onCommit={(x) =>
              run(updateItem, { ...ref, position: { x } }, { coalesceKey: `pos:${item.id}` })
            }
            testId="item-x"
          />
          <LengthField
            label={t('inspector.positionY')}
            value={item.position.y}
            step={100}
            onCommit={(y) =>
              run(updateItem, { ...ref, position: { y } }, { coalesceKey: `pos:${item.id}` })
            }
            testId="item-y"
          />
        </div>
        <div className="flex items-end gap-1">
          <NumericField
            className="flex-1"
            label={t('furniture.rotation')}
            value={item.rotation}
            parse={(text) => {
              const n = Number(text.replace(',', '.').trim());
              return text.trim() !== '' && Number.isFinite(n) ? n : null;
            }}
            format={(n) => String(Math.round(n * 10) / 10).replace('.', ',')}
            invalidMessage={t('field.invalidNumber')}
            suffix={t('field.unitDegrees')}
            step={15}
            onCommit={rotate}
            testId="item-rotation"
          />
          <IconButton label={t('furniture.rotateLeft')} onClick={() => rotate(item.rotation + 90)}>
            <RotateCcw className="size-4" />
          </IconButton>
          <IconButton label={t('furniture.rotateRight')} onClick={() => rotate(item.rotation - 90)}>
            <RotateCw className="size-4" />
          </IconButton>
        </div>
        {(definition.mount === 'wall' || definition.mount === 'surface') && (
          <LengthField
            label={t('furniture.elevation')}
            value={item.position.z}
            min={0}
            step={50}
            onCommit={(z) =>
              run(updateItem, { ...ref, position: { z } }, { coalesceKey: `z:${item.id}` })
            }
            testId="item-elevation"
          />
        )}
        {definition.mount === 'ceiling' && (
          <p className="text-xs text-slate-500">{t('furniture.ceilingMounted')}</p>
        )}
        <p className="flex gap-2 text-xs text-slate-500">
          <Move className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(definition.mount === 'wall' ? 'furniture.dragHintWall' : 'furniture.dragHint')}
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <Button
          icon={<Copy className="size-4" />}
          onClick={duplicateSelectedItem}
          data-testid="duplicate-item"
        >
          {t('furniture.duplicate')}
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={remove}
          data-testid="delete-item"
        >
          {t('furniture.delete')}
        </Button>
      </div>
    </div>
  );
}
