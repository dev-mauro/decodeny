# ADR-0005: Monorepo, herramientas y estrategia de calidad

- Estado: aceptada
- Fecha: 2026-10-25

## Decisión

- **pnpm workspaces** con paquetes consumidos desde su código fuente TypeScript (sin paso de build interno). Turborepo se incorporará cuando los tiempos de build lo justifiquen.
- TypeScript `strict` + `noUncheckedIndexedAccess`; ESLint `strictTypeChecked` + reglas de React Hooks; Prettier.
- Límites de capas verificados con **dependency-cruiser**.
- Tests: Vitest (unitarios), **fast-check** (propiedades: geometría, ida y vuelta de archivos), Playwright (E2E con WebGL por software).
- Cobertura mínima de `domain`: 90 % de líneas.
- Husky + lint-staged + commitlint (Conventional Commits). CI en GitHub Actions sin despliegue (hosting pendiente).
- Versiones de dependencias fijadas a líneas mayores probadas (TypeScript 5.9, Vite 7, Vitest 3, ESLint 9, Zod 4, React 19, Three r186).

## Consecuencias

- `pnpm check` reproduce localmente lo que ejecuta CI.
- Actualizar a mayores nuevas (TS 7, Vite 8, Vitest 5, ESLint 10) será una tarea explícita y aislada.
