import type { Level, Vec2 } from '@decodeny/domain';
import type { ComponentType, RefObject } from 'react';
import type { Box3 } from 'three';
import type { ViewerCameraApi } from '../scene/EditCamera';
import type { ViewerSelection } from '../selection';
import type { PersonProfile } from './person-profile';

/** Modos incluidos. El registro admite agregar otros (recorrido guiado, VR…). */
export type BuiltInNavigationMode = 'edit' | 'ghost' | 'person';
export type NavigationModeId = BuiltInNavigationMode | (string & {});

export interface NavigationModeProps {
  readonly level: Level;
  readonly bounds: Box3 | null;
  readonly selection: ViewerSelection | null;
  readonly profile: PersonProfile;
  readonly cameraApiRef?: RefObject<ViewerCameraApi | null> | undefined;
  /** Si ya se encuadró el contenido alguna vez (evita reencuadrar al volver a edición). */
  readonly autoFitted: RefObject<boolean>;
  readonly onPointerLockChange?: ((locked: boolean) => void) | undefined;
  /** Punto de partida elegido (planta, mm); si no cae en un recinto se usa el automático. */
  readonly walkStart?: Vec2 | null | undefined;
  /** Balanceo de cabeza al caminar (apagado por defecto). */
  readonly headBob?: boolean | undefined;
}

export interface NavigationModeDefinition {
  readonly id: NavigationModeId;
  /** `demand` renderiza solo ante cambios (edición); `always` para movimiento continuo. */
  readonly frameloop: 'demand' | 'always';
  /** Campo de visión vertical de la cámara en este modo (grados). */
  readonly fov: number;
  /** Selección y cotas habilitadas (solo en edición). */
  readonly interactive: boolean;
  readonly Component: ComponentType<NavigationModeProps>;
}
