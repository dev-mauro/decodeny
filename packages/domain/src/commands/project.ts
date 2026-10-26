import { DomainError } from '../errors';
import { defineCommand } from './command';

export const renameProject = defineCommand<{ readonly name: string }>(
  'project.rename',
  (draft, args) => {
    const name = args.name.trim().slice(0, 120);
    if (name === '') throw new DomainError('invalid-argument', 'El nombre no puede estar vacío');
    draft.meta.name = name;
  },
);
