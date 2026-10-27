# Arquitectura

## Capas

```
apps/web  ──▶  packages/viewer  ──▶  packages/catalog  ──▶  packages/domain
   │                  │                                         ▲
   └──────────────────┴─────────────────────────────────────────┘
```

| Paquete             | Responsabilidad                                                                                                                                                                      | Depende de                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `@decodeny/domain`  | Esquema del documento (Zod), consultas, integridad, comandos, historial (patches de Immer), migraciones, import/export, geometría 2D (ingletes, offsets, tortuga), registro genérico | zod, immer, nanoid          |
| `@decodeny/catalog` | Contenido: definiciones paramétricas (`defineOpening`) de puertas y ventanas; más adelante muebles, materiales y decoración. Sin Three.js ni React                                   | domain                      |
| `@decodeny/viewer`  | Builders de mallas puros (`MeshData`, testeables sin WebGL), componentes R3F, cámara, selección, cotas                                                                               | domain, catalog, three, R3F |
| `@decodeny/web`     | UI (React + Tailwind + Radix), stores (Zustand), i18n, autoguardado, archivos, atajos                                                                                                | domain, catalog, viewer     |

El SDK de definiciones (parámetros con default/mín/máx, primitivas `box`, `OpeningDefinition`) vive en `domain`, para que el visor y la UI trabajen con cualquier definición sin conocerla.

Las reglas se verifican con dependency-cruiser (`pnpm depcruise`).

## Flujo de datos

```
UI (campo, botón, atajo)
   │  useCommand()(command, args, { coalesceKey })
   ▼
projectStore.dispatch ── executeCommand (Immer produceWithPatches)
   │                        └─ DomainError → notificación, documento intacto
   ├─ historial: recordEntry (patches + inversos, fusión por coalesceKey)
   ├─ autoguardado: IndexedDB con debounce
   ▼
Project (inmutable) ──▶ <DecodenyViewer project levelId selection …/>
                          ├─ levelWallFootprints (inglete general por nodo)
                          ├─ roomInteriorPolygon (offset por espesor de cada muro)
                          └─ builders → BufferGeometry (memo por clave geométrica)
```

## Convenciones geométricas

- Planta: milímetros enteros, `x` este, `y` norte, ángulos en grados antihorarios.
- Mundo 3D: metros, `Y` arriba; el norte de la planta es `−Z` (`planToWorld`).
- Los nodos son el **eje** de los muros. Los recintos se crean desde medidas **interiores** y el eje se ubica a medio espesor hacia afuera.
- Caras de muro `left`/`right` relativas a la dirección `start → end`; cada cara tiene su propio slot de material (preparado para I5).
- UV en coordenadas de mundo (1 unidad = 1 m) para que las texturas tengan escala física real.

## Puntos de extensión ya preparados

| Necesidad futura                    | Mecanismo                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Más tipos de puertas/ventanas       | Un archivo con `defineOpening` en `packages/catalog` + registrarlo; test de contrato automático |
| Muebles, luces, decoración (I4, I6) | `items[]` con `def` + `params` genéricos; `Registry` para definiciones                          |
| Materiales (I5)                     | `materials[]` + `finish.left/right`, `room.floor/ceiling`; slots en las mallas                  |
| Multi-piso                          | `levels[]` con `elevation`                                                                      |
| Modos de navegación                 | `navigationModes` (Registry): `edit`, `person`, `ghost`; se agregan registrando una definición  |
| Nuevos formatos de archivo          | Pipeline `migrateDocument → ProjectSchema → checkIntegrity`                                     |

## Navegación (I2)

- Cada modo es una `NavigationModeDefinition` (frameloop, FOV, si es interactivo y su componente). `person` se carga bajo demanda porque Rapier pesa ~2 MB.
- La entrada se abstrae en `MovementIntent` (adelante/derecha/arriba/correr): hoy la produce el teclado (`KeyboardEvent.code`, independiente del layout); en I8 la producirá un joystick táctil.
- El paso físico de la persona (`stepPerson`) es una función pura sobre un controlador cinemático; se prueba en Node contra Rapier real (`person-physics.test.ts`).
- `PersonProfile` define estatura, altura de ojos, radio, velocidades y escalón máximo: base para futuros perfiles y para sentarse/acostarse.
- **Punto de partida:** `chooseSpawn` usa `walkStart` (planta) si cae en un recinto; si no, la cámara si está dentro de uno, o el recinto seleccionado. La app lo elige con la ubicación con el puntero (ADR-0010): un clic en el piso, en 3D o en la planta.
- **Balanceo de cabeza** (`headBob`, opcional y recordado): `stepHeadBob` sube y baja la cámara una vez por paso según la velocidad real; se desactiva con `prefers-reduced-motion`.

## Puertas y ventanas (I3)

- Un vano es `{ wallId, def, offset, params }`: `offset` es la distancia del nodo `start` al centro; si el muro se mueve o se divide, el vano lo acompaña (la topología reubica `offset`).
- Toda definición declara la **envolvente** `width`/`height` (+ `sill` en ventanas); el dominio la valida contra el muro: tramo útil fuera de las esquinas, dintel mínimo y sin superposición (`opening-conflict`).
- El visor recorta el muro (agujero, o muesca si arranca del piso), agrega jambas, dintel, peana y umbral, y dibuja las piezas que devuelve `build`. En edición, `plan` dibuja los arcos de apertura.
- Colisiones: los vanos `passable` (puertas) dejan solo el dintel; las ventanas no se atraviesan.
- La UI de propiedades se genera desde los parámetros; las opciones con `semantic` (`wall-face`, `wall-end`) se muestran con nombres de recintos y como izquierda/derecha vistas desde el recinto.
- Un tipo desconocido (archivo más nuevo) se dibuja con `unknownOpening` y se conserva intacto al exportar.

## Muebles (I4)

- Un mueble es un `Item { def, position {x, y, z}, rotation, params }`. Marco local: `x` a lo ancho, `z` con el frente en +z (con rotación 0 mira al sur), origen en el centro de la huella sobre el piso.
- Toda definición (`defineItem`) declara su envolvente (`width`/`depth`/`height`, o `envelope()`), un generador `build` de cajas y cilindros, presets, montaje y afordancias (`sit`, `lie`) para el futuro.
- **Medidas libres:** los rangos son amplios (10 cm a 6 m). Por encima de `comfortMin` el mueble es paramétrico (las patas no engordan); por debajo, `buildItemParts` lo construye en el mínimo y lo escala a lo pedido, así nunca se rompe la geometría.
- El dominio es agnóstico del catálogo: los avisos (`itemWarnings`: superposición o muro atravesado) y el ajuste al arrastrar (`snapItemPlacement`: respaldo contra el muro, costado contra la esquina y, con `neighbors`, junto a otro mueble cara a cara y alineado con sus bordes) reciben la envolvente o las huellas desde el catálogo (`itemEnvelope`). Arrastre y ubicación con el puntero comparten `itemPlacementAt` (app).
- Los muebles se mueven y eliminan con su recinto; en recorrido bloquean el paso (salvo `solid: false`) y la persona aparece lejos de ellos.
- **Selección múltiple:** la interfaz tiene una selección principal (la del inspector) y un grupo (`selection-model.ts`, funciones puras). El visor recibe `selectionGroup`, dibuja el grupo como seleccionado e informa si un clic fue aditivo (Shift, Ctrl o Cmd, `SelectOptions`); en la planta, Shift + arrastrar emite un `AreaSelectEvent`. La aplicación decide qué entra (hoy, solo muebles). El grupo se arrastra, empuja, gira (alrededor de su centro), duplica, copia y borra junto, siempre en un solo paso de deshacer (`moveItems`, `rotateItems`).
- En la planta, los muebles se dibujan por capas (lo plano abajo, lo de superficie arriba, lo de cielo al final) para que una alfombra no tape lo que tiene encima.
- El test de contrato del catálogo recorre cada definición con parámetros por defecto, mínimos, máximos, cada opción y cada preset, y exige que la caja envolvente coincida con las medidas (±1 mm).

## Materiales (I5)

- Instancias en `project.materials[]` (`def`, `tint`, `scale`, `rotation`, `params`); se asignan a caras de muro (`finish.left/right`), pisos y cielos con `applyMaterial` (`SurfaceTarget`). Varias superficies pueden compartir una instancia; `detachMaterial` la independiza.
- El catálogo describe patrones; el visor los pinta proceduralmente a escala física (ADR-0008) y cachea campo, textura y material.
- La UI (`FinishPicker`) se genera desde los parámetros del material; el cuentagotas copia y pega instancias; la paleta de colores reúne los ya usados en el proyecto.

## Iluminación y decoración (I6)

- **Montajes** (`ItemDefinition.mount`): `floor`; `wall` (siempre apoyado en el muro más cercano, `position.z` = altura desde el piso; al agregarse busca un lugar que no tape puertas ni ventanas); `ceiling` (cuelga del cielo de su recinto: `itemBase`); `surface` (se apoya sobre el mueble que tiene debajo: `surfaceElevationAt`).
- **Luminarias:** `emitters(params)` devuelve fuentes con lúmenes y kelvin; el visor crea luces puntuales (lm/4π escalado a la exposición de la escena, color por temperatura) y hace brillar bombillas y pantallas. Presupuesto (`lightBudget`): se encienden las `MAX_LAMP_LIGHTS` más cercanas a la cámara y, de noche, las `MAX_SHADOW_LAMPS` más próximas proyectan sombra (con el sol, ≤ 4 luces con sombra); la selección se recalcula al moverse la cámara y mantiene la cantidad estable para no recompilar materiales.
- **Día/noche:** el visor recibe `lighting`; de noche no hay sol y casi no hay luz ambiente.
- **Imágenes del usuario (cuadros):** un parámetro `image` guarda el id de un asset (`project.assets`). Los bytes viven en IndexedDB (store `assets`) y se exponen como object URLs (`assetUrl`). Con imágenes, se exporta un `.decodeny.zip` con `project.decodeny.json` + `assets/…`; abrir acepta `.json` y `.zip`.
- Objetos planos (≤ 3 cm, alfombras) no generan avisos de superposición.

## Herramientas de la vista (I7)

- **Capturas:** `ViewerApi.captureImage(scale)` renderiza y lee el lienzo en el mismo paso (sin `preserveDrawingBuffer`); la app descarga un PNG.
- **Capas:** `hiddenGroups` oculta muebles, decoración o luminarias (las luces siguen encendidas).
- **Corte:** `sectionHeight` recorta la escena con un plano global y dibuja la sección oscura de los muros (sin los vanos que atraviesa), como en un plano.
- **Medición:** con `onMeasurePoint`, los clics hacen un raycast propio sobre la geometría del nivel (los objetos detienen la propagación de sus eventos) y la app muestra distancia total, horizontal y vertical. En la planta el contrato es el mismo (z = 0): `snapMeasurePoint` engancha esquinas y caras interiores de recintos y bordes de muebles, o fija la dirección cada 45°.
- **Plantillas:** `ProjectBuilder` arma proyectos con los mismos comandos y reglas que la UI (ejemplo, estudio, 1D1B, 2D2B); cada plantilla se verifica sin superposiciones ni muebles fuera de recinto.

## Planta 2D (I7)

- `PlanView` (paquete `viewer`, SVG puro) es otra proyección del mismo documento: recintos con nombre y superficie, muros con huecos en los vanos, símbolos de apertura del catálogo (`plan`), muebles (los de cielo, punteados) y cotas del recinto seleccionado.
- Comparte con la vista 3D la selección, el hover y los eventos de arrastre (`RoomDragEvent`, `ItemDragEvent`, `OpeningDragEvent`), así la app usa los mismos manejadores y ajustes. Agrega `NodeDragEvent`: arrastrar las esquinas del recinto seleccionado (`moveNode`, con `snapNodePosition` a escuadra).
- La captura serializa el SVG a PNG; rueda = zoom hacia el cursor, arrastrar el fondo = desplazar, doble clic = encuadrar.
- **Dibujar muros** (`tool="wall"`, tecla `W`): `snapDrawPoint` (dominio) engancha nodos, muros, direcciones cada 45° y la grilla de 1 cm; el largo se puede escribir. Cada tramo es un `addWall`, que une el muro al grafo (esquinas, T y cruces en X) y detecta recintos (ADR-0009). `deleteWall` quita un muro y vuelve a detectar (unir recintos).

## Ubicar elementos nuevos (ADR-0010)

- Elegir un mueble del catálogo abre una sesión de ubicación: el visor (3D y planta) recibe `placement` y solo informa `PlacementEvent`s (`move`, `end`); la app previsualiza `addItem` con id fijo y el ajuste por montaje compartido con el arrastre (`itemPlacementAt`). Clic o Enter confirman, R gira, Esc cancela.
- Mientras se edita una terminación (puntero o foco en el editor), el visor recibe `trueSurfaceColors` y muestra muros, pisos y cielos sin el brillo de selección, con su color real.

## Robustez e idiomas (I8)

- **Límites de error:** la vista (3D o planta) está aislada; si falla, se ofrece reintentar o pasar a la planta 2D, y el documento sigue intacto. Un límite general ofrece exportar el proyecto y recargar.
- **Contexto WebGL:** si el navegador lo descarta, se pide restaurarlo (`ContextLossGuard`) y se avisa al recuperarse.
- **Sin conexión (PWA):** un plugin del build genera `sw.js` con la lista de archivos del build (sin dependencias); el service worker los precarga, sirve el documento con red primero y el resto desde la caché. Si se instala una versión nueva, se ofrece actualizar.
- **Accesibilidad:** con `prefers-reduced-motion`, la cámara no anima transiciones.
- **Idiomas:** `es` (base, tipa las claves) y `en` (TypeScript exige cada traducción). El idioma elegido se recuerda; el formato de medidas (coma o punto decimal), los mensajes de validación y el catálogo siguen al idioma.

## Muros compartidos

Los recintos adosados comparten tabique (ADR-0007). `normalizeTopology` (dominio) mantiene el grafo sin nodos duplicados, con uniones en T y sin muros repetidos; `roomSides` agrupa tramos colineales en lados estables («Lado n», «Lado n.k»). Arrastrar un recinto en la vista produce `RoomDragEvent`s que la aplicación ajusta con `snapRoomTranslation` y previsualiza como transacción (`preview` / `commitPreview` del store) para que quede como un solo paso de deshacer.

## Decisiones

Ver [`docs/adr`](adr/).
