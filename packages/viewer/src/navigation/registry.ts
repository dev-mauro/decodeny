import { Registry } from '@decodeny/domain';
import { lazy } from 'react';
import { EditMode } from './EditMode';
import { GhostMode } from './GhostMode';
import type { NavigationModeDefinition } from './types';

/**
 * Registro de modos de navegación. Un modo nuevo (p. ej. recorrido guiado o WebXR) se agrega
 * registrando su definición; el visor no necesita cambios.
 */
export const navigationModes = new Registry<NavigationModeDefinition>('navigation-mode').register(
  { id: 'edit', frameloop: 'demand', fov: 45, interactive: true, Component: EditMode },
  { id: 'ghost', frameloop: 'always', fov: 70, interactive: false, Component: GhostMode },
  {
    id: 'person',
    frameloop: 'always',
    fov: 70,
    interactive: false,
    // Rapier (WASM) solo se descarga al entrar por primera vez al recorrido.
    Component: lazy(() => import('./PersonMode')),
  },
);
