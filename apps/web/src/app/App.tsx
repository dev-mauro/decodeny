import type { ViewerCameraApi } from '@decodeny/viewer';
import { useRef } from 'react';
import { IoDialogs } from '@/features/io/IoDialogs';
import { CreateRoomDialog } from '@/features/rooms/CreateRoomDialog';
import { LeftPanel } from './LeftPanel';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { Toaster } from '@/shared/ui/Toaster';
import { AppCrash } from './AppCrash';
import { InspectorPanel } from './InspectorPanel';
import { TopBar } from './TopBar';
import { useShortcuts } from './use-shortcuts';
import { Viewport } from './Viewport';

/**
 * Layout: barra superior + [recintos | vista 3D | propiedades] en escritorio, cada panel con
 * su propio scroll. En pantallas angostas los paneles se apilan bajo la vista y la página
 * completa se desplaza (base para el soporte móvil, I8).
 */
export function App() {
  const cameraRef = useRef<ViewerCameraApi>(null);
  useShortcuts();

  return (
    <ErrorBoundary fallback={(error) => <AppCrash error={error} />}>
      <div className="flex h-full flex-col">
        <TopBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <aside className="order-2 flex shrink-0 flex-col border-t border-slate-200 bg-white lg:order-1 lg:min-h-0 lg:w-72 lg:border-t-0 lg:border-r">
            <LeftPanel />
          </aside>
          <div className="order-1 flex h-[55vh] min-h-[320px] shrink-0 lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
            <Viewport cameraRef={cameraRef} />
          </div>
          <aside className="order-3 flex shrink-0 flex-col border-t border-slate-200 bg-white lg:min-h-0 lg:w-80 lg:border-t-0 lg:border-l">
            <InspectorPanel />
          </aside>
        </main>
        <CreateRoomDialog
          onCreated={() => requestAnimationFrame(() => cameraRef.current?.fitToContent())}
        />
        <IoDialogs />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
