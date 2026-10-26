import { roomWallTargets, type Level, type Room } from '@decodeny/domain';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FinishPicker } from './FinishPicker';

/** Terminaciones de un recinto: piso, todos sus muros interiores y cielo. */
export function RoomFinishes({ level, room }: { readonly level: Level; readonly room: Room }) {
  const { t } = useTranslation();
  const targets = useMemo(
    () => ({
      floor: [{ kind: 'floor', roomId: room.id }] as const,
      walls: roomWallTargets(level, room),
      ceiling: [{ kind: 'ceiling', roomId: room.id }] as const,
    }),
    [level, room],
  );
  return (
    <section className="flex flex-col gap-2" aria-labelledby="room-finishes-title">
      <h3
        id="room-finishes-title"
        className="text-xs font-semibold tracking-wide text-slate-400 uppercase"
      >
        {t('finishes.title')}
      </h3>
      <FinishPicker
        level={level}
        label={t('finishes.floor')}
        surface="floor"
        targets={targets.floor}
        testId="finish-floor"
      />
      <FinishPicker
        level={level}
        label={t('finishes.walls')}
        surface="wall"
        targets={targets.walls}
        testId="finish-walls"
      />
      <FinishPicker
        level={level}
        label={t('finishes.ceiling')}
        surface="ceiling"
        targets={targets.ceiling}
        testId="finish-ceiling"
      />
    </section>
  );
}
