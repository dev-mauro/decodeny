/**
 * Registro genérico de extensiones identificadas por `id` (definiciones de catálogo,
 * modos de navegación, herramientas, formatos de import/export…). Ver ADR-004.
 */
export class Registry<T extends { readonly id: string }> {
  readonly #entries = new Map<string, T>();

  constructor(readonly kind: string) {}

  register(...entries: readonly T[]): this {
    for (const entry of entries) {
      if (this.#entries.has(entry.id)) {
        throw new Error(`${this.kind}: "${entry.id}" ya está registrado`);
      }
      this.#entries.set(entry.id, entry);
    }
    return this;
  }

  get(id: string): T | undefined {
    return this.#entries.get(id);
  }

  require(id: string): T {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`${this.kind}: "${id}" no está registrado`);
    return entry;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  list(): T[] {
    return [...this.#entries.values()];
  }

  get size(): number {
    return this.#entries.size;
  }
}
