import type { IdFactory } from '../ids';
import type { Project } from '../model/types';

export interface CommandContext {
  readonly ids: IdFactory;
}

/**
 * Una operación sobre el documento. `run` muta un borrador de Immer y lanza `DomainError`
 * si la operación es inválida (en ese caso el documento no cambia).
 * El `type` identifica el comando (telemetría, historial, futura colaboración).
 */
export interface Command<Args, Result = void> {
  readonly type: string;
  run(draft: Project, args: Args, ctx: CommandContext): Result;
}

export function defineCommand<Args, Result = void>(
  type: string,
  run: (draft: Project, args: Args, ctx: CommandContext) => Result,
): Command<Args, Result> {
  return { type, run };
}
