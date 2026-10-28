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
- **Escena lista:** el visor marca `data-ready` en su raíz después del primer cuadro dibujado (la vista 3D se carga bajo demanda); los E2E que hacen clic en la escena lo esperan (`waitForScene`).
- **Draw calls:** `PartMeshes` fusiona las piezas de un objeto por material (`mergeParts`): una malla por material y objeto, que sigue siendo seleccionable por separado. `ViewerApi.renderStats()` (expuesto con `?perf`) mide el costo; `perf-budget.spec.ts` lo vigila.
- **Miniaturas:** `itemThumbnail` (visor) dibuja cada definición con sus parámetros por defecto en un renderer compartido fuera de pantalla, de a una por cuadro, y las guarda en memoria; la geometría de las piezas (`partGeometry`) es la misma que usa la escena.
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
- **Dibujar muros** (`tool="wall"`, tecla `W`): `snapDrawPoint` (dominio) engancha nodos, muros, direcciones cada 45° y la grilla de 1 cm; el largo se puede escribir. Cada tramo es un `addWall`, que une el muro al grafo (esquinas, T y cruces en X) y detecta recintos (ADR-0009). `deleteWall` quita un muro y vuelve a detectar (unir recintos). Lo dibujado es la **cara interior** (ADR-0015): al cerrar un espacio, `addWall` (con la cadena dibujada, `chain`) corre sus muros nuevos medio espesor hacia afuera (`fitRoomToDrawnFaces`), así 2 × 1 m dibujados dejan 2 × 1 m libres; adosado a un muro existente, se mide desde su cara.

## Ubicar elementos nuevos (ADR-0010)

- Elegir un mueble del catálogo abre una sesión de ubicación: el visor (3D y planta) recibe `placement` y solo informa `PlacementEvent`s (`move`, `end`); la app previsualiza `addItem` con id fijo y el ajuste por montaje compartido con el arrastre (`itemPlacementAt`). Clic o Enter confirman, R gira, Esc cancela.
- Mientras se edita una terminación (puntero o foco en el editor), el visor recibe `trueSurfaceColors` y muestra muros, pisos y cielos sin el brillo de selección, con su color real.

## Robustez e idiomas (I8)

- **Límites de error:** la vista (3D o planta) está aislada; si falla, se ofrece reintentar o pasar a la planta 2D, y el documento sigue intacto. Un límite general ofrece exportar el proyecto y recargar.
- **Contexto WebGL:** si el navegador lo descarta, se pide restaurarlo (`ContextLossGuard`) y se avisa al recuperarse.
- **Carga inicial:** la app (UI, dominio, catálogo, planta) y `vendor` (React) son lo único que se descarga al abrir (~225 kB gzip). La vista 3D (`@decodeny/viewer/canvas`), las miniaturas (`@decodeny/viewer/thumbnails`) y la física del recorrido se importan bajo demanda; `manualChunks` asigna por ruta de módulo para que React y el helper de precarga no caigan en el chunk de r3f. `scripts/check-bundle-size.mjs` lo verifica en CI.
- **Sin conexión (PWA):** un plugin del build genera `sw.js` con la lista de archivos del build (sin dependencias); el service worker los precarga, sirve el documento con red primero y el resto desde la caché. Si se instala una versión nueva, se ofrece actualizar.
- **Accesibilidad:** con `prefers-reduced-motion`, la cámara no anima transiciones.
- **Idiomas:** `es` (base, tipa las claves) y `en` (TypeScript exige cada traducción). El idioma elegido se recuerda; el formato de medidas (coma o punto decimal), los mensajes de validación y el catálogo siguen al idioma.

## Móvil y táctil (I8)

- **Layout:** desde 1024 px, tres columnas; por debajo, `MobileLayout` (en horizontal con poca altura, riel de navegación a la izquierda y paneles a la derecha): la vista ocupa la pantalla y una barra inferior abre recintos, catálogo o propiedades como hoja. Las herramientas que piden tocar la vista (ubicar, dibujar, medir, elegir el punto de partida) cierran la hoja (`mobilePanel` en el estado de interfaz).
- **Recorrido táctil:** `TouchControls` (visor) escribe en un `VirtualInput` mutable (joystick, mirada, subir/bajar) que los modos leen junto con el teclado (`useMovementIntent`, `combineIntent`); la app lo activa con `(pointer: coarse)` y le pasa los textos.
- **Planta:** pellizcar con dos dedos hace zoom alrededor del punto entre ellos y cancela lo que se estuviera arrastrando.
- **Atajos con equivalente táctil:** las indicaciones de herramienta (`ToolHint`) llevan botones (Dejar aquí, Girar, Cancelar, Terminar).
- E2E con un proyecto `mobile` (Pixel 7 emulado) que corre `mobile.spec.ts`.

## Opciones, cuadrícula y solo lectura

- **Opciones** (engranaje en la barra superior): idioma, corte de muros, cuadrícula y solo lectura.
- **Solo lectura:** lo aplica el store del documento: `dispatch` y `preview` responden `DomainError('read-only')` y deshacer/rehacer no hacen nada; abrir otro proyecto sí se permite. La interfaz lo refleja (inspector y catálogo en un `fieldset` desactivado, sin arrastres, sin dibujo, indicador en la barra). Se recuerda en el navegador.
- **Cuadrícula de trabajo:** paso de 10 cm, 25 cm, 50 cm o 1 m. Fija el paso de todos los ajustes (`gridStep` en `snapDrawPoint`, `snapItemPlacement`, `snapRoomTranslation`, `snapNodePosition`; en la app, `snapStep()`). Se ve en el plano (patrón SVG) y en 3D: sobre los pisos la pinta su shader (`setFloorGrid`, líneas con ancho en el mundo: no depende de la precisión de profundidad ni de derivadas) y fuera de los espacios hay líneas a ras del suelo (`FloorGrid`), ambas alineadas al origen del proyecto.
- **Corte de muros:** un arreglo de planos compartido (`SECTION_PLANES`) recorta solo la envolvente (muros, pisos, cielos, vanos); los muebles no se cortan y los que quedan enteros sobre el corte se ocultan. Con el modo **«solo los que tapan»** (`sectionMode: "facing"`, recordado), `levelWallExposure` (dominio) clasifica cada muro en exterior (con su normal hacia afuera), interior o suelto, y `facingCutWalls` (visor, puro, con histéresis de ~5°) recorta en cada cuadro los interiores, los sueltos y los exteriores con la cámara de su lado de afuera; los demás usan materiales sin recorte (variante `whole`) y conservan lo montado en ellos. La raíz del visor expone los recortados en `data-section-cut`.
- **Dibujo de muros:** guías de alineación (el punto se engancha a la x o la y de un nodo y se dibuja una guía); con el dedo se arrastra y se suelta en cada esquina (radio de captura mayor); los largos exactos se escriben con el teclado (o se corrigen después en el inspector del espacio). No hay panel de indicaciones sobre la vista.
- **Gestos:** `usePreventBrowserZoom` evita que pellizcar sobre las vistas haga zoom de la página (incluido Safari en iOS); el resto de la página conserva el zoom del navegador.

## Colaboración en tiempo real (ADR-0011)

- **Transporte** (`features/collab`): WebRTC entre navegadores, sin servidor propio. STUN públicos e ICE no incremental: la oferta y la respuesta completas se comprimen (`signal-codec.ts`, formato `D1.o.…` / `D1.a.…`) y se intercambian a mano (enlace `#join=…` y código de respuesta). Estrella: cada invitado se conecta solo con el anfitrión. Por par, dos canales negociados (`peer-link.ts`): `doc` (confiable, ordenado, mensajes grandes fragmentados con `framing.ts`) y `presence` (sin reintentos).
- **Documento:** el store emite cada cambio local (`ProjectSync.onChange`: comando con sus argumentos e ids generados, deshacer/rehacer o reemplazo) y acepta operaciones remotas (`applyRemote`, `applyHistory`, `syncProject`), rehaciendo encima una vista previa en curso. `HostSync` es la autoridad de orden: ejecuta las operaciones de los invitados con los mismos ids (`commandByType` + `replayIds`), las registra en su historial (el de la sesión) y difunde los parches numerados. `GuestSync` es optimista: lo visible es lo confirmado más los pendientes reejecutados; lo que el anfitrión rechaza se descarta. Deshacer es de la sesión. Los invitados no autoguardan (el documento es del anfitrión).
- **Presencia:** el visor informa la pose de la cámara (`onCameraPose`, ~12 Hz) y dibuja a los demás (`peers`: lista + `pose(id)` + `subscribe`, para no pasar por React a cada pose). Cuerpo simple con nombre: de pie en el recorrido, flotando en edición y vuelo; en el plano no se dibuja. Las poses se reenvían cada segundo aunque no cambien.
- **Imágenes:** `onLocalAsset` avisa las imágenes nuevas; viajan en base64 por el canal del documento y el anfitrión envía las del proyecto a quien entra.
- **Salas con código (ADR-0014):** con la nube configurada, la señalización va por Firestore (`RoomSignaling`, adaptador en `features/cloud/firebase/rooms.ts`). El anfitrión abre `rooms/{código}` (6 caracteres sin ambiguos) y escucha `requests`; el invitado deja su **oferta** y espera la **respuesta** (se invierte quién ofrece respecto de lo manual). Conectados, la solicitud se borra; la sala sigue abierta para más personas hasta terminar la sesión o vencer (12 h, la limpieza diaria la borra). `?sala=CÓDIGO` abre el diálogo con el código. «Conectar a mano» deja el flujo de copiar y pegar.

## Maquetas y nube (ADR-0012)

- **Maquetas** (`features/maquetas`): los proyectos guardados en este navegador (store `maquetas` de IndexedDB). `MaquetaSession` (lógica pura, dependencias inyectadas) sabe de dónde viene el documento abierto: una **maqueta** (cada cambio se guarda; si está compartida, se sube agrupado), un **borrador** (proyecto nuevo: su primer cambio lo vuelve maqueta), una **visita** (compartida de otra persona: su primer cambio crea una maqueta propia con `forkOf`) o el documento de un **anfitrión** (invitado: no se guarda; al terminar, queda como maqueta). Antes de cambiar de documento se confirma el guardado pendiente.
- **Nube** (`features/cloud`): puertos (`Identity`, `HouseRepository`, `AssetRepository`) sin Firebase. El adaptador `firebase/` (Auth anónima + Firestore _lite_, chunk `cloud` bajo demanda) es el único que importa `firebase/*` (regla `firebase-behind-ports`). Sin `VITE_FIREBASE_*` la nube queda desactivada. `MemoryCloud` reproduce las reglas para los tests.
- **A prueba de fallos:** cada pestaña sube sobre la revisión que conoce (en memoria) y las reglas exigen dueño y `rev + 1`; `conflict` → la maqueta vuelve a la versión de la nube y lo de esta pestaña queda en una copia abierta; `forbidden` → queda como copia; `not-found` → solo local; sin red → se reintenta.
- **Firestore:** `houses/{id}` (proyecto comprimido en `Bytes` sin índice, `assets`, `rev`, `lastVisitAt`) y `assets/{id}` + `chunks/{n}` (inmutables, verificados por `sha256`). Reglas, índices y emuladores en `firebase/`; `cleanup.yml` borra lo que no tuvo visitas en 30 días; `firebase-rules.yml` despliega las reglas.
- **Colaboración:** el invitado instala la sesión antes de recibir el documento del anfitrión, así nunca lo guarda sobre una maqueta propia.

## Iluminación (I10b)

- **Profundidad:** `CameraDepth` ajusta `near`/`far` en cada cuadro a la escena (`depthRange`: `near` hasta la mitad de la distancia a la caja del nivel, `far` lo justo para la escena y el suelo). Con el rango fijo 0,05–2000 m, el piso, las alfombras y el plano de sombra bajo los pisos parpadeaban de lejos.
- **Capas del suelo:** el plano que recibe la sombra del sol va a −2 cm y la cuadrícula decorativa a −1 cm; lo plano sobre el piso (alfombras, ≤ 30 mm) se apoya 1 mm arriba.
- **Sol:** `sunShadowFrame` encuadra la cámara de la sombra a la caja del nivel vista desde el sol, alineada a texels, con sesgos según el tamaño del texel y bordes suaves (`shadow.radius`).
- **Sombras estáticas:** `StaticShadows` apaga `shadowMap.autoUpdate` y pide mapas nuevos solo cuando cambia el documento, la luz, el modo, el corte o las capas; quien mueve algo lo pide con `requestShadowUpdate` (puertas, luces encendidas). Recorrer la casa no recalcula sombras.
- **Cielos:** en el recorrido y el vuelo proyectan sombra (el sol entra por las ventanas); en edición no (se ve la casa por arriba, como maqueta).
- **Luminarias:** las encendidas tienen ventaja de 1,5 m al reelegir por cercanía (`KEEP_MARGIN`) y las que entran suben su intensidad en 0,3 s.
- **Contacto:** `ContactShadows` dibuja, en una malla instanciada (un draw call), una mancha degradada bajo cada mueble de piso, apoyada sobre la alfombra si la hay (`contactShadowItems`).
- **Balance de día:** menos relleno uniforme (ambiente 0,1, hemisferio 0,5) y más entorno (0,9), con el sol a 2,2.

## Plantas (I12)

- **Dominio** (`commands/levels.ts`): `addLevel` (vacía o con el contorno de otra: muros y recintos con ids nuevos, sin vanos ni muebles), `duplicateLevel`, `renameLevel`, `setLevelElevation` y `removeLevel` (siempre queda una). `levels` se mantiene ordenado por elevación; `nextLevelElevation` propone el muro más alto de la planta superior más la losa (`SLAB_THICKNESS`, 200 mm). `levelAbove` y `levelBelow` ubican las vecinas.
- **Visor:** además de la planta activa, dibuja las demás como **contexto** (`LevelView` con `context`: sin selección, corte de muros ni luminarias propias). En edición solo las de abajo (las de arriba se ocultan, como casa de muñecas); en recorrido y vuelo, todas. El encuadre y las sombras usan la unión de las plantas visibles.
- **Plano:** la planta de abajo se ve en tenue (`plan-underlay`) para alinear los muros.
- **Interfaz** (`features/levels`): `LevelSwitcher` arriba de «Espacios» (también en móvil) elige la planta activa, agrega otra arriba y ajusta nombre y altura del piso; `PgUp`/`PgDn` suben y bajan.
- **Escaleras** (ADR-0016): items de la categoría `stairs` (`catalog/items/stairs.ts`) que declaran `floorOpening`, `colliders` (rampas), `planOutline`, `planSymbol` y `fillsStorey`. El visor deriva la losa de cada planta (`scene/slabs.ts`: huecos del piso y del cielo, canto de la losa) y en el recorrido colisiona con todas las plantas (las de arriba se apoyan en su losa, `slabCollider`); `onLevelChange` informa la planta en la que quedan los pies. Cada escalera declara su línea de paso (`walkPath`): sobre ella, adelante y atrás la siguen hacia donde se mira (subir o bajar), sin moverse de costado, y la mirada gira con el tramo (`stair-guide.ts`).
- **Vacío y ascensor** (`catalog/items/structure.ts`): el vacío solo abre la losa (con barandas alrededor). El ascensor declara la afordancia `travel` y un hueco que atraviesa `openingSpan` losas (`slabOpenings`); el visor deriva sus paradas (`projectElevators`), dibuja la plataforma y las rejas de las paradas donde no está (`ElevatorCars`) y, en el recorrido, un almacén propio (como el de las puertas) la mueve: la persona viaja parada sobre ella. `onNearbyElevator` informa el ascensor detenido en el que está la persona y `ViewerApi.travel(levelId)` lo manda a otra planta (la botonera de la app, también con las teclas 1–9).

## Presentación y puertas en el recorrido (adelanto de I14)

- **Presentación** (`features/presentation`): solo la vista (sin barra, paneles ni herramientas de edición), a pantalla completa y en solo lectura **temporal** (`setReadOnly(true, { remember: false })`: al salir vuelve la preferencia). `?presentar=1` la abre directo (la pantalla completa la pide un clic).
- **Puertas operables:** una definición declara `operable: { param, closed }` (`openAngle` en las batientes, `open` en las correderas); `operableParams` interpola entre cerrada y abierta (la del documento o, si allí está cerrada, la por defecto). En recorrido y vuelo, el visor tiene un `DoorStore` propio (no toca el documento): empieza como el documento, anima la hoja (0,7 s) y `DoorControls` encuentra la puerta al alcance (de frente o al lado) y la abre o cierra con E/F, un clic con el puntero capturado o `ViewerApi.toggleDoor`. Solo una puerta **cerrada** tiene colisión (`closedDoorColliders`); no se cierra con la persona en el vano. La app indica la acción (`onNearbyDoor` → `DoorHint`).

## Muros compartidos

Los recintos adosados comparten tabique (ADR-0007). `normalizeTopology` (dominio) mantiene el grafo sin nodos duplicados, con uniones en T y sin muros repetidos; `roomSides` agrupa tramos colineales en lados estables («Lado n», «Lado n.k»). Arrastrar un recinto en la vista produce `RoomDragEvent`s que la aplicación ajusta con `snapRoomTranslation` y previsualiza como transacción (`preview` / `commitPreview` del store) para que quede como un solo paso de deshacer.

## Decisiones

Ver [`docs/adr`](adr/).
