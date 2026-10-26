import type { Command } from '@decodeny/domain';
import { describeDomainError } from '@/shared/lib/errors';
import { notify } from './notifications-store';
import { useProjectStore, type DispatchOptions, type DispatchResult } from './project-store';

/** Ejecuta un comando notificando los errores de dominio al usuario (fuera de React). */
export function runCommand<A, R>(
  command: Command<A, R>,
  args: A,
  options?: DispatchOptions,
): DispatchResult<R> {
  const out = useProjectStore.getState().dispatch(command, args, options);
  if (!out.ok) notify('error', describeDomainError(out.error));
  return out;
}

/**
 * Ejecuta comandos desde la UI notificando los errores de dominio al usuario.
 * Devuelve el resultado para que el llamador reaccione (p. ej. seleccionar lo creado).
 */
export function useCommand(): typeof runCommand {
  // `runCommand` no depende de props ni estado: ya es una referencia estable.
  return runCommand;
}
