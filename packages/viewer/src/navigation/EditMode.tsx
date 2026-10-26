import { EditCamera } from '../scene/EditCamera';
import type { NavigationModeProps } from './types';

/** Modo edición: cámara orbital, selección y cotas. */
export function EditMode({ bounds, cameraApiRef, autoFitted }: NavigationModeProps) {
  return <EditCamera bounds={bounds} apiRef={cameraApiRef} autoFitted={autoFitted} />;
}
