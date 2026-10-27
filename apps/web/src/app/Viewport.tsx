import {
  PlanView,
  type AreaSelectEvent,
  type ViewerApi,
  type ViewerCameraApi,
} from '@decodeny/viewer';
import { Maximize, PenLine, Plus, Sparkles, SquareDashed } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useAssetStore } from '@/features/assets/asset-store';
import { useTranslation } from 'react-i18next';
import { loadSampleProject, loadTemplate } from '@/features/io/project-actions';
import { PROJECT_TEMPLATES } from '@/features/samples/templates';
import { NavigationModeSwitch } from '@/features/navigation/NavigationModeSwitch';
import { WalkOverlay } from '@/features/navigation/WalkOverlay';
import { useItemDragHandler } from '@/features/furniture/use-item-drag-handler';
import {
  cancelPlacement,
  confirmPlacement,
  handlePlacementEvent,
  rotatePlacement,
} from '@/features/furniture/placement';
import { handleWalkStartEvent } from '@/features/navigation/walk-start';
import { itemsInArea } from '@/features/furniture/item-actions';
import { useOpeningDragHandler } from '@/features/openings/use-opening-drag-handler';
import { useNodeDragHandler } from '@/features/plan/use-node-drag-handler';
import { PlanTools, WallDrawHint } from '@/features/plan/PlanTools';
import { ViewSwitch } from '@/features/plan/ViewSwitch';
import { drawWall } from '@/features/walls/wall-actions';
import { useRoomDragHandler } from '@/features/rooms/use-room-drag-handler';
import { Button, IconButton } from '@/shared/ui/Button';
import { useProjectStore } from '@/state/project-store';
import { useActiveLevel, useUiStore } from '@/state/ui-store';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { useCoarsePointer } from '@/shared/lib/use-media-query';
import { ToolHint } from '@/shared/ui/ToolHint';
import { notify } from '@/state/notifications-store';
import { MeasurePanel, ViewportTools } from './ViewportTools';
import { ViewportError } from './ViewportError';

// La vista 3D (Three.js, ~330 kB gzip) llega en su propio chunk: la interfaz aparece antes.
const DecodenyViewer = lazy(() =>
  import('@decodeny/viewer/canvas').then((m) => ({ default: m.DecodenyViewer })),
);

function ViewerLoading() {
  const { t } = useTranslation();
  return (
    <div
      className="flex size-full items-center justify-center bg-slate-50 text-sm text-slate-500"
      data-testid="viewer-loading"
    >
      {t('viewport.loading3d')}
    </div>
  );
}

interface ViewportProps {
  readonly cameraRef: RefObject<ViewerCameraApi | null>;
}

export function Viewport({ cameraRef }: ViewportProps) {
  const { t, i18n } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const level = useActiveLevel();
  const selection = useUiStore((s) => s.selection);
  const selectionGroup = useUiStore((s) => s.selectionGroup);
  const selectMany = useUiStore((s) => s.selectMany);
  const onAreaSelect = useCallback(
    (area: AreaSelectEvent) =>
      selectMany(
        itemsInArea(level, area.min, area.max).map((id) => ({ kind: 'item', id }) as const),
        area.additive,
      ),
    [level, selectMany],
  );
  const select = useUiStore((s) => s.select);
  const openCreate = useUiStore((s) => s.setCreateRoomOpen);
  const navigationMode = useUiStore((s) => s.navigationMode);
  const setPointerLocked = useUiStore((s) => s.setPointerLocked);
  const highlighted = useUiStore((s) => s.highlighted);
  const setViewportHover = useUiStore((s) => s.setViewportHover);
  const onRoomDrag = useRoomDragHandler();
  const onOpeningDrag = useOpeningDragHandler();
  const onItemDrag = useItemDragHandler();
  const onNodeDrag = useNodeDragHandler();
  const view = useUiStore((s) => s.view);
  const planTool = useUiStore((s) => s.planTool);
  const setPlanTool = useUiStore((s) => s.setPlanTool);
  const exitPlanTool = useCallback(() => setPlanTool('select'), [setPlanTool]);
  const lighting = useUiStore((s) => s.lighting);
  const hiddenGroups = useUiStore((s) => s.hiddenGroups);
  const sectionHeight = useUiStore((s) => s.sectionHeight);
  const measuring = useUiStore((s) => s.measuring);
  const measurePoints = useUiStore((s) => s.measurePoints);
  const editingFinish = useUiStore((s) => s.finishEditors > 0);
  const pointerHeight = useUiStore((s) => s.placement?.pointerHeight ?? null);
  const pickingWalkStart = useUiStore((s) => s.pickingWalkStart);
  const walkStart = useUiStore((s) => s.walkStart);
  const headBob = useUiStore((s) => s.headBob);
  const coarse = useCoarsePointer();
  const touchControls = useMemo(
    () =>
      coarse
        ? {
            joystick: t('navigation.touchJoystick'),
            look: t('navigation.touchLook'),
            up: t('navigation.touchUp'),
            down: t('navigation.touchDown'),
          }
        : null,
    [coarse, t],
  );
  // Una sola sesión de ubicación a la vez: un mueble nuevo o el punto de partida del recorrido.
  const placement = useMemo(
    () =>
      pointerHeight !== null
        ? { height: pointerHeight, onEvent: handlePlacementEvent }
        : pickingWalkStart
          ? { height: 0, onEvent: handleWalkStartEvent }
          : null,
    [pickingWalkStart, pointerHeight],
  );
  const addMeasurePoint = useUiStore((s) => s.addMeasurePoint);
  const viewerRef = useRef<ViewerApi>(null);
  // Diagnóstico de rendimiento (`?perf`): los tests de presupuesto leen el costo de dibujar.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('perf')) return;
    const target = window as Window & { decodenyPerf?: () => unknown };
    target.decodenyPerf = () => viewerRef.current?.renderStats?.() ?? null;
    return () => {
      delete target.decodenyPerf;
    };
  }, []);
  const onGraphicsRestored = useCallback(() => notify('info', t('errors.webglLost')), [t]);
  // Re-render cuando una imagen termina de cargar: el visor recibe una función nueva.
  const assetUrls = useAssetStore((s) => s.urls);
  const assetUrl = useCallback((id: string) => assetUrls[id], [assetUrls]);
  const isEmpty = level.rooms.length === 0 && level.walls.length === 0;

  return (
    <section
      aria-label={t('viewport.label')}
      className="relative min-h-[320px] flex-1 overflow-hidden"
    >
      <div className="absolute inset-0">
        <ErrorBoundary
          resetKey={project.meta.id}
          fallback={(error, retry) => <ViewportError error={error} onRetry={retry} />}
        >
          {view === 'plan' ? (
            <PlanView
              project={project}
              levelId={level.id}
              selection={selection}
              selectionGroup={selectionGroup}
              onSelectionChange={select}
              onAreaSelect={onAreaSelect}
              highlighted={highlighted}
              onHoverChange={setViewportHover}
              onRoomDrag={onRoomDrag}
              onItemDrag={onItemDrag}
              onOpeningDrag={onOpeningDrag}
              onNodeDrag={onNodeDrag}
              tool={planTool}
              wallThickness={project.settings.defaultWallThickness}
              onWallDraw={drawWall}
              onToolExit={exitPlanTool}
              placement={placement}
              measurePoints={measurePoints}
              {...(measuring ? { onMeasurePoint: addMeasurePoint } : {})}
              hiddenGroups={hiddenGroups}
              apiRef={viewerRef}
              locale={i18n.language}
            />
          ) : (
            <Suspense fallback={<ViewerLoading />}>
              <DecodenyViewer
                project={project}
                levelId={level.id}
                selection={selection}
                selectionGroup={selectionGroup}
                onSelectionChange={select}
                highlighted={highlighted}
                onHoverChange={setViewportHover}
                onRoomDrag={onRoomDrag}
                onOpeningDrag={onOpeningDrag}
                onItemDrag={onItemDrag}
                placement={placement}
                lighting={lighting}
                assetUrl={assetUrl}
                apiRef={viewerRef}
                hiddenGroups={hiddenGroups}
                sectionHeight={sectionHeight}
                measurePoints={measurePoints}
                trueSurfaceColors={editingFinish}
                {...(measuring ? { onMeasurePoint: addMeasurePoint } : {})}
                onGraphicsRestored={onGraphicsRestored}
                cameraRef={cameraRef}
                navigationMode={navigationMode}
                onPointerLockChange={setPointerLocked}
                walkStart={walkStart}
                headBob={headBob}
                touchControls={touchControls}
                locale={i18n.language}
              />
            </Suspense>
          )}
        </ErrorBoundary>
      </div>

      <WalkOverlay />

      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
        <ViewSwitch />
        {view === '3d' && <NavigationModeSwitch />}
        {view === 'plan' && <PlanTools />}
      </div>

      <WallDrawHint />
      {pointerHeight !== null && (
        <ToolHint
          text={t('catalog.placeHint')}
          testId="placement-hint"
          actions={[
            {
              label: t('catalog.placeHere'),
              onClick: () => confirmPlacement(),
              testId: 'placement-confirm',
            },
            {
              label: t('catalog.placeRotate'),
              onClick: () => rotatePlacement(90),
              testId: 'placement-rotate',
            },
            {
              label: t('catalog.placeCancel'),
              onClick: cancelPlacement,
              testId: 'placement-cancel',
            },
          ]}
        />
      )}
      {pickingWalkStart && pointerHeight === null && (
        <ToolHint
          text={t('navigation.pickStartHint')}
          testId="walk-start-hint"
          actions={[
            {
              label: t('catalog.placeCancel'),
              onClick: () => useUiStore.getState().setPickingWalkStart(false),
              testId: 'walk-start-cancel',
            },
          ]}
        />
      )}

      <ViewportTools viewerRef={viewerRef} />
      <MeasurePanel />

      {navigationMode === 'edit' && view === '3d' && (
        <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <IconButton label={t('viewport.fit')} onClick={() => cameraRef.current?.fitToContent()}>
            <Maximize className="size-4" />
          </IconButton>
          <IconButton label={t('viewport.top')} onClick={() => cameraRef.current?.viewFromTop()}>
            <SquareDashed className="size-4" />
          </IconButton>
        </div>
      )}

      {isEmpty && navigationMode !== 'person' && !(view === 'plan' && planTool === 'wall') && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-lg backdrop-blur">
            <h2 className="text-lg font-semibold text-slate-900">{t('empty.title')}</h2>
            <p className="text-sm text-slate-500">{t('empty.body')}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => openCreate(true)}
              >
                {t('empty.addRoom')}
              </Button>
              <Button
                icon={<Sparkles className="size-4" />}
                onClick={loadSampleProject}
                data-testid="load-sample"
              >
                {t('empty.loadSample')}
              </Button>
              <Button
                icon={<PenLine className="size-4" />}
                onClick={() => setPlanTool('wall')}
                data-testid="empty-draw-walls"
              >
                {t('empty.drawWalls')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{t('empty.templates')}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {PROJECT_TEMPLATES.map(({ id }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => loadTemplate(id)}
                  data-testid={`load-template-${id}`}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50"
                >
                  {t(`empty.template.${id}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
