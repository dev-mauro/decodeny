import type { Command } from './command';
import * as assets from './assets';
import * as items from './items';
import * as materials from './materials';
import * as openings from './openings';
import * as project from './project';
import * as rooms from './rooms';
import * as walls from './walls';

/** Cualquier comando, sin tipar sus argumentos (para ejecutar operaciones que llegan serializadas). */
export type AnyCommand = Command<unknown, unknown>;

const isCommand = (value: unknown): value is AnyCommand =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string' &&
  typeof (value as { run?: unknown }).run === 'function';

/**
 * Todos los comandos del dominio por su `type`. Permite ejecutar una operación recibida como
 * datos (`{ type, args }`), p. ej. de otro participante de una sesión colaborativa. Un comando
 * nuevo se registra solo con exportarlo desde su módulo.
 */
export const COMMANDS: ReadonlyMap<string, AnyCommand> = (() => {
  const map = new Map<string, AnyCommand>();
  for (const module of [assets, items, materials, openings, project, rooms, walls]) {
    for (const value of Object.values(module)) {
      if (!isCommand(value)) continue;
      if (map.has(value.type) && map.get(value.type) !== value) {
        throw new Error(`Tipo de comando repetido: ${value.type}`);
      }
      map.set(value.type, value);
    }
  }
  return map;
})();

export function commandByType(type: string): AnyCommand | undefined {
  return COMMANDS.get(type);
}
