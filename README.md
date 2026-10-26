# Decodeny

Visualizador web de departamentos y casas en 3D a partir de sus medidas. Pensado para corredores de propiedades: se ingresan las medidas interiores de cada recinto y se obtiene un modelo 3D navegable, exportable e importable.

> Hoja de ruta completa en [`plan.md`](plan.md). Estado actual: **I0–I7 completas** (I7 salvo dibujar muros sueltos) e **I8 en curso** (robustez e inglés listos).

## Funcionalidades actuales

- **Recintos por medidas interiores:** rectangulares o por tramos (largo + giro, para formas en L, U…), con lados de hasta 5 cm. Edición de cada lado, altura, espesor, nombre y posición; los recintos adosados **comparten tabique** y se pueden **arrastrar** con ajuste magnético a los muros vecinos.
- **Muros con nombre** («Lado 2» automático o propio) y hover sincronizado entre los paneles y la vista.
- **Puertas y ventanas paramétricas** (batiente, doble, corredera, vano libre; fija, corredera, de abatir, ventanal), con validación contra el muro, arcos de apertura y paso real en el recorrido.
- **Muebles paramétricos** (22 tipos: living, comedor, dormitorio, escritorio, baño, cocina, almacenamiento; más 6 luminarias y 6 de decoración), con medidas libres desde 10 cm, presets, apoyo automático en muros y esquinas, avisos de superposición y colisiones.
- **Materiales** a escala física (pinturas, papel mural, ladrillo, cerámicas, porcelanato, pisos flotantes, parquet recto y en espiga, alfombra…), color ajustable, cuentagotas y terminación por cara de muro.
- **Iluminación y decoración:** luminarias de cielo, muro, pie y mesa con lúmenes y temperatura de color, modo día/noche, espejos, plantas, alfombras, cortinas, repisas y **cuadros con foto propia** (se exportan en `.zip`).
- **Vistas:** 3D (edición, **recorrido** a 1,70 m con colisiones, **vuelo libre**) y **planta 2D** (con edición de vértices). Capas, corte de muros para ver interiores, **medición**, capturas PNG.
- **Plantillas** de inicio (estudio, 1D1B, 2D1B, 2D2B) y proyecto de ejemplo amoblado.
- Deshacer/rehacer de todo, autoguardado local, exportar/importar `.decodeny.json` / `.decodeny.zip`, español e inglés.

## Requisitos

- Node.js ≥ 22
- pnpm 9 (vía Corepack: `corepack enable`, o `npm i -g pnpm@9`). Sin habilitar Corepack, se puede anteponer `corepack` a cada comando: `corepack pnpm install`.
- Para E2E local: Google Chrome instalado (Playwright usa el canal `chrome`).

## Comandos

| Comando              | Descripción                                               |
| -------------------- | --------------------------------------------------------- |
| `pnpm install`       | Instala dependencias del monorepo                         |
| `pnpm dev`           | Servidor de desarrollo en http://localhost:5173           |
| `pnpm build`         | Typecheck + build de producción                           |
| `pnpm preview`       | Sirve el build en http://localhost:4173                   |
| `pnpm test`          | Tests unitarios (Vitest) de todos los paquetes            |
| `pnpm test:coverage` | Tests con cobertura (umbral 90 % en `domain`)             |
| `pnpm e2e`           | Tests end-to-end (Playwright)                             |
| `pnpm lint`          | ESLint (typescript-eslint estricto con tipos)             |
| `pnpm depcruise`     | Verifica los límites entre capas                          |
| `pnpm check`         | Formato + lint + tipos + capas + tests (lo mismo que CI)  |
| `pnpm size`          | Presupuesto de tamaño del build (gzip, tras `pnpm build`) |
| `pnpm build:pages`   | Build para GitHub Pages (bajo `/decodeny/`)               |

## Publicación

El sitio se publica en https://dev-mauro.github.io/decodeny/ desde la rama `prod`, que contiene solo el build (`pnpm build:pages`, base `/decodeny/`). GitHub Pages la sirve con _Settings → Pages → Deploy from a branch → `prod` / raíz_.

La publicación es automática (`.github/workflows/pages.yml`): cuando la CI termina bien sobre un push a `main`, el workflow compila ese mismo commit y lo sube como un commit nuevo en `prod`. Solo publica la última versión de `main` y no hace nada si el sitio no cambió. También se puede lanzar a mano desde _Actions → Publicar en GitHub Pages → Run workflow_. Para volver a una versión anterior basta con revertir el commit correspondiente en `prod`.

La ruta base se fija con `--base` al compilar; el service worker y el manifest usan rutas relativas, así que el mismo código sirve en cualquier subruta.

## Estructura

```
apps/web            Aplicación React (UI, estado, i18n, E2E)
packages/domain     Dominio puro: documento, comandos, historial, migraciones, geometría 2D
packages/catalog    Contenido paramétrico: puertas y ventanas (luego muebles, materiales…)
packages/viewer     Visor 3D (React Three Fiber): proyección del documento a la escena
docs/               Arquitectura y decisiones (ADR)
```

Ver [`docs/architecture.md`](docs/architecture.md) y [`CONTRIBUTING.md`](CONTRIBUTING.md).
