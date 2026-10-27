import { useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';

/**
 * Modo presentación (adelanto de I14): para mostrar la maqueta a un cliente. Solo la vista, a
 * pantalla completa y en solo lectura (temporal: al salir vuelve la preferencia que había). Se
 * puede abrir directo con `?presentar=1` (p. ej. junto a `?maqueta=…`).
 */
export const PRESENT_PARAM = 'presentar';

let readOnlyBefore: boolean | null = null;

function setUrlFlag(on: boolean): void {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(PRESENT_PARAM, '1');
  else url.searchParams.delete(PRESENT_PARAM);
  if (url.href !== window.location.href) window.history.replaceState(null, '', url);
}

export const isFullscreen = () => document.fullscreenElement !== null;

/** Pantalla completa (necesita un gesto del usuario: un clic). */
export function toggleFullscreen(): void {
  if (isFullscreen()) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

export function startPresentation(options: { readonly fullscreen?: boolean } = {}): void {
  if (useUiStore.getState().presenting) return;
  const project = useProjectStore.getState();
  readOnlyBefore = project.readOnly;
  project.setReadOnly(true, { remember: false });
  useUiStore.setState({
    presenting: true,
    selection: null,
    selectionGroup: [],
    measuring: false,
    measurePoints: [],
    planTool: 'select',
    mobilePanel: null,
  });
  setUrlFlag(true);
  if (options.fullscreen !== false && !isFullscreen()) toggleFullscreen();
}

export function stopPresentation(): void {
  if (!useUiStore.getState().presenting) return;
  useProjectStore.getState().setReadOnly(readOnlyBefore ?? false, { remember: false });
  readOnlyBefore = null;
  useUiStore.setState({ presenting: false });
  setUrlFlag(false);
  if (isFullscreen()) toggleFullscreen();
}

/** Al abrir la app con `?presentar=1` (la pantalla completa la pide un clic después). */
export function presentationFromUrl(): void {
  if (new URL(window.location.href).searchParams.get(PRESENT_PARAM) === '1') {
    startPresentation({ fullscreen: false });
  }
}
