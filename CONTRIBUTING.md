# Cómo contribuir

## Flujo de trabajo

- **Trunk-based**: ramas cortas desde `main` (`feat/…`, `fix/…`, `docs/…`), PR pequeños, _squash merge_.
- **Conventional Commits** (validado por commitlint en el hook `commit-msg`): `feat(viewer): …`, `fix(domain): …`.
- El hook `pre-commit` ejecuta ESLint y Prettier sobre los archivos en stage.
- Antes de abrir un PR: `pnpm check` y `pnpm e2e`. La plantilla de PR contiene la _Definition of Done_.

## Reglas de arquitectura (verificadas en CI)

1. `packages/domain` es TypeScript puro: sin React, Three.js ni DOM.
2. `packages/viewer` no depende de `apps/web`. El visor **nunca** modifica el documento: emite intenciones (selección) por callbacks.
3. Toda modificación del documento es un **comando** (`defineCommand`) ejecutado vía `useCommand()` / `dispatch`. Así se obtienen gratis deshacer/rehacer, validación y (a futuro) colaboración.
4. Longitudes en **milímetros enteros**; la conversión a metros ocurre solo en los bordes.
5. Textos de UI solo en `apps/web/src/i18n/locales`. El dominio devuelve códigos de error.

## Cambiar el formato del documento

1. Modifica el esquema en `packages/domain/src/model/schema.ts`.
2. Incrementa `CURRENT_SCHEMA_VERSION`.
3. Agrega una migración `{ from: N - 1, migrate }` en `packages/domain/src/io/migrations.ts`.
4. Agrega un fixture del formato anterior y un test que lo cargue.

## Agregar un comando

1. Crea el comando en `packages/domain/src/commands/` con `defineCommand('entidad.accion', …)`.
2. Valida con `assertRange` / `assertRoomGeometry` y lanza `DomainError` con un código existente (o agrega uno y su traducción en `errors.*`).
3. Tests unitarios con `createBench()` / `benchWithRoom()` (ids deterministas).
4. Úsalo desde la UI con `useCommand()`; pasa `coalesceKey` si se invoca repetidamente (flechas, sliders).

## Contenido de catálogo

Puertas y ventanas (y luego muebles y materiales) son **definiciones registradas** (`Registry`) en `packages/catalog`, con parámetros declarados (default/mín/máx), un generador puro de piezas y versión propia (`categoria.nombre@version`). Agregar contenido no requiere tocar el motor ni la UI.

### Agregar un tipo de puerta o ventana

1. Crea `packages/catalog/src/openings/<tipo>.ts` con `defineOpening({ id: 'window.<nombre>@1', … })`. Declara `width` y `height` (y `sill` si es ventana) con `lengthParam`; usa los helpers de `shared.ts` (marco, hojas, giros, símbolos de planta).
2. Regístralo en `packages/catalog/src/openings/index.ts`.
3. `pnpm test`: el test de contrato del catálogo lo construye con parámetros por defecto, mínimos, máximos y cada opción, y verifica que quepa en un muro estándar. La UI de propiedades se genera sola.
4. Si más adelante cambias sus parámetros de forma incompatible, crea `@2` en vez de modificar `@1`.

### Agregar un mueble

1. Agrega un `defineItem({ id: 'furniture.<nombre>@1', … })` en el archivo de su categoría en `packages/catalog/src/items/` (o uno nuevo). Usa `widthParam`/`depthParam`/`heightParam` (rangos amplios) y declara `comfortMin`: por debajo de esas medidas el mueble se escala en vez de reconstruirse.
2. Las piezas deben llenar exactamente ancho × alto × profundidad (frente en +z). Usa `span`, `legs`, `drawerFronts` de `shared.ts`.
3. Regístralo en `packages/catalog/src/items/index.ts` y corre `pnpm test`: el contrato lo valida en todo su rango.

### Agregar un material

1. Agrega una definición en `packages/catalog/src/materials/index.ts`: superficies (`wall`, `floor`, `ceiling`), patrón, parámetros (con `lengthParam`/`colorParam`), color, `tintable`, rugosidad y colores sugeridos.
2. Si necesita un patrón nuevo, registra un pintor en `packages/viewer/src/materials/patterns.ts` (devuelve un campo de sombras que se repite y su tamaño en mm).
3. `pnpm test`: los contratos verifican la definición y que su patrón genere una imagen válida.

### Luminarias y objetos de muro

- Una luminaria es un `defineItem` con `emitters(params)` (lúmenes y kelvin desde sus parámetros; usa `lightParams` de `items/lighting.ts`). Las piezas `bulb` y `shade` brillan cuando está encendida.
- `mount: 'wall'` con `defaultElevation` para cuadros, espejos y apliques; `mount: 'ceiling'` cuelga del cielo; `mount: 'surface'` se apoya sobre el mueble de abajo.
- Un parámetro `imageParam` permite que el usuario suba una imagen; el slot `picture` la muestra.
