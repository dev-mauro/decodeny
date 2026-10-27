import type { ViewerCameraApi } from '@decodeny/viewer';
import { useRef } from 'react';
import { useDesktopLayout } from '@/shared/lib/use-media-query';
import { CollabDialog } from '@/features/collab/CollabDialog';
import { IoDialogs } from '@/features/io/IoDialogs';
import { CreateRoomDialog } from '@/features/rooms/CreateRoomDialog';
import { LeftPanel } from './LeftPanel';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { Toaster } from '@/shared/ui/Toaster';
import { AppCrash } from './AppCrash';
import { InspectorPanel } from './InspectorPanel';
import { MobileLayout } from './MobileLayout';
import { TopBar } from './TopBar';
import { useShortcuts } from './use-shortcuts';
import { Viewport } from './Viewport';

/**
 * Layout: barra superior + [recintos | vista 3D | propiedades] en escritorio, cada panel con
 * su propio scroll. En pantallas angostas, la vista ocupa la pantalla y los paneles se abren
 * como hojas desde una barra inferior (`MobileLayout`).
 */
export function App() {
  const cameraRef = useRef<ViewerCameraApi>(null);
  const desktop = useDesktopLayout();
  useShortcuts();

  return (
    <ErrorBoundary fallback={(error) => <AppCrash error={error} />}>
      <div className="flex h-full flex-col">
        <TopBar />
        {desktop ? (
          <main className="flex min-h-0 flex-1 flex-row overflow-hidden">
            <aside className="flex min-h-0 w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
              <LeftPanel />
            </aside>
            <div className="flex min-h-0 flex-1">
              <Viewport cameraRef={cameraRef} />
            </div>
            <aside className="flex min-h-0 w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
              <InspectorPanel />
            </aside>
          </main>
        ) : (
          <MobileLayout cameraRef={cameraRef} />
        )}
        <CreateRoomDialog
          onCreated={() => requestAnimationFrame(() => cameraRef.current?.fitToContent())}
        />
        <IoDialogs />
        <CollabDialog />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
