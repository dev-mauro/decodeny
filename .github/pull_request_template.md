## Qué cambia y por qué

<!-- Resumen breve. Enlaza el issue/iteración del plan (p. ej. I2). -->

## Definition of Done

- [ ] Tipos estrictos, sin `any` ni `@ts-ignore` injustificados.
- [ ] Tests nuevos/actualizados; `pnpm check` y `pnpm e2e` en verde.
- [ ] Sin textos de UI hardcodeados (todo pasa por i18n).
- [ ] Si cambia el esquema del documento: `schemaVersion` + migración + test con fixture.
- [ ] Si cambia una definición de catálogo de forma incompatible: nueva versión `@n+1` + migración de params.
- [ ] Docs/ADR actualizados si hay una decisión de arquitectura.
- [ ] Revisado manualmente en local (`pnpm dev`).
