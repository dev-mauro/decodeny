import { create } from 'zustand';
import { maquetas } from './maquetas';

/** Diálogos de las maquetas (lista y compartir), abribles desde la barra y el menú móvil. */
export const useMaquetasUi = create<{
  readonly listOpen: boolean;
  readonly shareOpen: boolean;
}>()(() => ({ listOpen: false, shareOpen: false }));

export const openMaquetas = () => {
  void maquetas.refresh();
  useMaquetasUi.setState({ listOpen: true });
};
