import { create } from 'zustand';
import type { LoadErrorDescription } from '@/shared/lib/errors';

export type PendingConfirmation = 'new' | null;

interface IoState {
  readonly importError: LoadErrorDescription | null;
  readonly confirmation: PendingConfirmation;
  readonly fileInput: HTMLInputElement | null;
  readonly setImportError: (error: LoadErrorDescription | null) => void;
  readonly setConfirmation: (confirmation: PendingConfirmation) => void;
  readonly registerFileInput: (input: HTMLInputElement | null) => void;
}

export const useIoStore = create<IoState>()((set) => ({
  importError: null,
  confirmation: null,
  fileInput: null,
  setImportError: (importError) => set({ importError }),
  setConfirmation: (confirmation) => set({ confirmation }),
  registerFileInput: (fileInput) => set({ fileInput }),
}));
