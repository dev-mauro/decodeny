# Decodeny — Plan de desarrollo

> **Estado (2026-10-26):** I0 ✅ · I1 ✅ · I2 ✅ · muros compartidos y arrastre (adelantados de I7) ✅ · I3 ✅ · I4 ✅ · I5 ✅ · I6 ✅ · I7 ✅ · I8 🟡 (errores, WebGL, movimiento reducido, inglés, PWA/offline y presupuesto de bundle en CI ✅; pendientes: móvil/táctil —postergado por decisión de producto—, telemetría —sin hosting no aplica—, presupuesto de tiempo de carga en CI).

> Aplicación web para modelar departamentos y casas a partir de medidas, recorrerlos en primera persona o en vuelo libre, y amoblarlos/decorarlos con elementos paramétricos.

---

## 0. Resumen ejecutivo

| #   | Iteración                                     | Resultado entregable                                                                 | Tamaño relativo |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| I0  | Fundaciones                                   | Repo, tooling, CI, arquitectura vacía funcionando, ADRs                              | S               |
| I1  | **Núcleo: muros por medidas + export/import** | El usuario ingresa medidas → ve el espacio en 3D → guarda/carga JSON                 | L               |
| I2  | **Navegación: modo persona y modo fantasma**  | Caminar a 1,70 m con colisiones / volar atravesando muros                            | M               |
| I3  | **Puertas y ventanas**                        | Vanos paramétricos en muros, transitables en modo persona                            | M               |
| I4  | **Muebles genéricos paramétricos**            | Mesas, sillas, sofás, sillones, escritorios, camas, baño                             | L               |
| I5  | **Materiales: color y texturas**              | Pintura, piso flotante, cerámica, alfombra, etc., con color ajustable                | M               |
| I6  | **Decoración e iluminación**                  | Luces, lámparas, cuadros (con imagen propia), plantas, alfombras                     | M               |
| I7  | Edición avanzada                              | Vista de planta 2D, muros compartidos entre recintos, cotas, herramienta de medición | L               |
| I8  | Endurecimiento para producción                | Rendimiento, móvil/táctil, accesibilidad, PWA/offline, i18n completo                 | M               |
| —   | Backlog futuro                                | Sentarse/acostarse, multi-piso, escaleras, modelos GLB, WebXR, compartir…            | —               |

Cada iteración termina en un **incremento usable** (verificable localmente; despliegue cuando se defina hosting), con tests y documentación. Las decisiones que habilitan el crecimiento futuro (catálogo extensible, versionado del documento, _affordances_ de interacción, niveles/pisos) se toman **desde I0–I1**, aunque las funcionalidades que las usan lleguen después: es barato ahora y carísimo de retro-adaptar.

---

## 1. Principios de arquitectura

1. **El documento del proyecto es la única fuente de verdad.** Todo lo que el usuario define (medidas, muebles, materiales) vive en un documento serializable (JSON). La escena 3D es una _proyección derivada_ de ese documento, nunca al revés. Consecuencias: export/import trivial, undo/redo trivial, tests sin WebGL, y en el futuro colaboración/sincronización.
2. **Dominio puro, sin Three.js.** El modelo de dominio, las validaciones, los comandos y la geometría 2D son TypeScript puro, testeable en Node.
3. **Contenido = datos + generadores registrados.** Muebles, puertas, ventanas, materiales y decoraciones son _definiciones_ registradas en un catálogo. Agregar un mueble nuevo = agregar un archivo, sin tocar el motor.
4. **Paramétrico, no escalado.** Un mueble no se "estira" uniformemente: se _reconstruye_ a partir de sus parámetros (ancho, profundidad, alto). Una mesa más ancha mantiene patas del mismo grosor.
5. **Versionado y migraciones desde el día 1.** El documento y cada definición de catálogo llevan versión. Archivos antiguos siempre se pueden abrir.
6. **Tolerancia hacia adelante.** Si un archivo referencia un mueble que esta versión no conoce, se muestra un placeholder (caja con su bounding box) y se preserva el dato al re-exportar; nunca se rompe la carga.
7. **Extensión por registros (registry pattern)** para: definiciones de catálogo, modos de navegación, herramientas de edición, interacciones del jugador, formatos de import/export.
8. **Límites de capas verificados automáticamente** (dependency-cruiser en CI), no solo por convención.

---

## 2. Stack tecnológico

| Área                 | Elección                                                                                                                | Motivo                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Lenguaje             | **TypeScript** (`strict`, `noUncheckedIndexedAccess`)                                                                   | Seguridad de tipos en un dominio con muchas medidas y relaciones   |
| Build                | **Vite**                                                                                                                | DX rápida, code-splitting, estándar de facto                       |
| Monorepo             | **pnpm workspaces + Turborepo**                                                                                         | Separación de capas real, caché de builds                          |
| UI                   | **React 19** + **Tailwind CSS** + **Radix UI / shadcn/ui**                                                              | Ecosistema, componentes accesibles                                 |
| 3D                   | **Three.js** vía **React Three Fiber** + **drei**                                                                       | Integración declarativa con React, ecosistema más grande en web 3D |
| Física / colisiones  | **Rapier** (`@react-three/rapier`, WASM)                                                                                | Character controller kinemático listo, rápido, determinista        |
| Estado               | **Zustand** + **Immer** (patches para undo/redo)                                                                        | Simple, rendimiento con selectores, patches nativos                |
| Máquinas de estado   | **XState v5** (modos de navegación y estados del jugador)                                                               | Necesario cuando lleguen sentarse/acostarse/transiciones           |
| Validación / esquema | **Zod**                                                                                                                 | Valida import, define parámetros del catálogo y genera tipos       |
| Geometría 2D         | **earcut** (triangulación), utilidades propias de polígonos                                                             | Pisos/cielos poligonales                                           |
| Persistencia local   | **IndexedDB** (`idb`)                                                                                                   | Autoguardado, imágenes de cuadros                                  |
| Empaquetado export   | **fflate** (zip)                                                                                                        | Exportar proyecto + imágenes en un archivo                         |
| Texturas             | **KTX2/Basis** (compresión GPU), fuentes CC0 (ambientCG, Poly Haven)                                                    | Memoria GPU y licencias limpias                                    |
| i18n                 | **i18next** (es primero, en después)                                                                                    | Evita strings hardcodeados desde el inicio                         |
| Tests                | **Vitest**, **fast-check** (property-based), **Playwright** (E2E + regresión visual)                                    | Pirámide de tests completa                                         |
| Calidad              | ESLint (typescript-eslint strict), Prettier, Husky + lint-staged, commitlint (Conventional Commits), dependency-cruiser | Estándar de industria                                              |
| CI                   | **GitHub Actions** (lint, typecheck, tests, build, e2e); despliegue pendiente de hosting                                | Cada PR verificado automáticamente                                 |
| Versionado           | **Changesets** + SemVer                                                                                                 | Changelog automático                                               |

Sin backend en las primeras iteraciones (**local-first**). La arquitectura deja la puerta abierta a un backend de guardado/compartición (ver backlog).

---

## 3. Arquitectura

### 3.1 Capas

```
┌──────────────────────────────────────────────────────────┐
│ apps/web            UI React: paneles, formularios,      │
│                     herramientas, atajos, i18n           │
├──────────────────────────────────────────────────────────┤
│ packages/viewer     R3F: escena, builders de mallas,     │
│                     materiales, navegación, física,      │
│                     selección/gizmos                     │
├──────────────────────────────────────────────────────────┤
│ packages/catalog    Definiciones de contenido: muebles,  │
│                     puertas, ventanas, materiales, deco  │
├──────────────────────────────────────────────────────────┤
│ packages/domain     Documento, esquemas Zod, comandos,   │
│                     migraciones, geometría 2D, SDK de    │
│                     definiciones (defineItem, …)         │
└──────────────────────────────────────────────────────────┘
   Dependencias solo hacia abajo. domain no importa nada de arriba.
```

### 3.2 Flujo de datos

```
Usuario ──(formulario / gizmo / import)──▶ Comando ──▶ Store (documento, Immer)
                                                         │   └─▶ historial (patches) → undo/redo
                                                         │   └─▶ autoguardado IndexedDB
                                                         ▼
                                     Selectores derivados (memoizados, puros)
                                     "descriptores de render": muros con vanos,
                                     polígonos de piso, árboles de piezas de muebles
                                                         ▼
                                     viewer: componentes R3F + colliders Rapier
```

### 3.3 Estructura de carpetas

```
3d-view/
├─ apps/
│  └─ web/
│     ├─ src/
│     │  ├─ app/              # shell, rutas, providers
│     │  ├─ features/         # por feature: walls/, openings/, items/, materials/, io/
│     │  │   └─ <feature>/    #   components/, hooks/, panels/, tools/
│     │  ├─ shared/ui/        # componentes de diseño
│     │  └─ i18n/
│     └─ e2e/                 # Playwright
├─ packages/
│  ├─ domain/
│  │  └─ src/
│  │     ├─ model/            # tipos + esquemas Zod del documento
│  │     ├─ commands/         # comandos (addWall, moveItem, …)
│  │     ├─ migrations/       # v1→v2, v2→v3 …
│  │     ├─ geometry/         # vectores, polígonos, ingletes, intervalos de vanos
│  │     ├─ definitions/      # SDK: defineItem, defineOpening, defineMaterial, registry
│  │     └─ units/            # mm, conversiones, formateo
│  ├─ catalog/
│  │  └─ src/
│  │     ├─ items/{furniture,bathroom,lighting,decor}/
│  │     ├─ openings/{doors,windows}/
│  │     └─ materials/{paint,wood,ceramic,carpet,…}/
│  └─ viewer/
│     └─ src/
│        ├─ scene/            # Level, Walls, Floors, Items, Openings
│        ├─ builders/         # descriptor → BufferGeometry
│        ├─ materials/        # cache de materiales/texturas
│        ├─ navigation/       # edit, ghost, person (registry)
│        ├─ physics/          # generación de colliders
│        └─ interaction/      # selección, gizmos, snapping
├─ docs/
│  ├─ adr/                    # Architecture Decision Records
│  ├─ architecture.md
│  └─ adding-content.md       # guía: cómo agregar un mueble/textura/puerta
└─ assets-src/                # texturas fuente → pipeline a KTX2
```

### 3.4 Convenciones globales

- **Unidades del documento: milímetros enteros.** Evita errores de punto flotante acumulados y es el estándar en arquitectura. La conversión a metros (unidades de Three.js) ocurre solo en el borde `viewer`.
- **Sistema de coordenadas:** planta en XY (domain) → mundo 3D X/Z con **Y hacia arriba** (Three.js). Rotaciones de planta en grados, sentido antihorario.
- **IDs:** `nanoid` con prefijo por tipo (`wall_…`, `item_…`) para depuración legible.
- **Identificador de definición:** `categoria.nombre@version`, ej. `furniture.table.rect@1`.

---

## 4. Modelo de dominio (documento del proyecto)

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "id": "proj_8f2k…",
    "name": "Depto Providencia",
    "createdAt": "2026-10-25T19:00:00Z",
    "updatedAt": "…",
    "generator": "decodeny@0.1.0",
  },
  "settings": { "displayUnits": "m", "defaultWallHeight": 2400, "defaultWallThickness": 150 },
  "levels": [
    // multi-piso preparado desde el día 1
    {
      "id": "lvl_1",
      "name": "Piso 1",
      "elevation": 0,
      "nodes": [
        { "id": "n1", "x": 0, "y": 0 },
        { "id": "n2", "x": 4000, "y": 0 },
      ],
      "walls": [
        {
          "id": "wall_1",
          "start": "n1",
          "end": "n2",
          "thickness": 150,
          "height": 2400,
          "finish": { "left": "mat_pintura_living", "right": "mat_pintura_pasillo" },
        },
      ],
      "openings": [
        {
          "id": "op_1",
          "wallId": "wall_1",
          "def": "door.single-swing@1",
          "offset": 800, // desde el nodo start, al centro del vano
          "params": { "width": 800, "height": 2000, "hinge": "left", "swing": "in" },
        },
      ],
      "rooms": [
        {
          "id": "room_1",
          "name": "Living",
          "boundary": ["n1", "n2", "n3", "n4"],
          "floor": "mat_piso_roble",
          "ceiling": "mat_cielo_blanco",
        },
      ],
      "items": [
        // muebles, decoración y luces: un único sistema
        {
          "id": "item_1",
          "def": "furniture.table.rect@1",
          "position": { "x": 2000, "y": 1500, "z": 0 },
          "rotation": 90,
          "params": { "width": 1600, "depth": 900, "height": 750 },
          "materials": { "top": "mat_roble", "legs": "mat_metal_negro" },
        },
      ],
    },
  ],
  "materials": [
    // instancias de material = definición base + overrides
    {
      "id": "mat_piso_roble",
      "def": "floor.laminate.oak@1",
      "tint": "#FFFFFF",
      "scale": 1,
      "rotation": 0,
    },
    { "id": "mat_pintura_living", "def": "paint.matte@1", "tint": "#EDE6DA" },
  ],
  "assets": [
    // imágenes de cuadros, etc.
    { "id": "asset_1", "kind": "image", "mime": "image/jpeg", "path": "assets/asset_1.jpg" },
  ],
}
```

Decisiones clave:

- **Muros como grafo** (nodos + segmentos), no como rectángulos sueltos: permite esquinas correctas, muros compartidos entre recintos y edición por nodo.
- **Vanos referencian un muro + offset**: si el muro se alarga o mueve, la puerta lo acompaña.
- **Items unificados**: un mueble, una lámpara y un cuadro son el mismo tipo de entidad con distinta definición. Una lámpara es un item que además _emite luz_.
- **Instancias de material** separadas de los elementos que las usan: cambiar "pintura living" afecta todos los muros que la usan; también se pueden duplicar.

---

## 5. Sistemas de extensibilidad (el corazón de la escalabilidad)

### 5.1 SDK de definiciones de catálogo

Toda definición declara: id, versión, categoría, nombre localizado, **esquema de parámetros (Zod) con default/min/max**, _slots_ de material, tipo de montaje, un **generador puro** de piezas y metadatos opcionales (interacciones, emisores de luz, colliders).

```ts
// packages/catalog/src/items/furniture/table-rect.ts
export default defineItem({
  id: 'furniture.table.rect',
  version: 1,
  category: 'table',
  name: { es: 'Mesa rectangular', en: 'Rectangular table' },
  params: z.object({
    width: mm({ default: 1600, min: 600, max: 3500, label: 'Ancho' }),
    depth: mm({ default: 900, min: 500, max: 1500, label: 'Profundidad' }),
    height: mm({ default: 750, min: 400, max: 1100, label: 'Alto' }),
    topThickness: mm({ default: 30, min: 15, max: 80, label: 'Grosor cubierta', advanced: true }),
  }),
  materialSlots: { top: 'wood.oak@1', legs: 'metal.black@1' },
  mount: 'floor', // floor | wall | ceiling | surface
  build: (p) => [
    box('top', {
      size: [p.width, p.topThickness, p.depth],
      at: [0, p.height - p.topThickness / 2, 0],
    }),
    ...insetCorners(p.width, p.depth, 60).map(([x, z]) =>
      box('legs', {
        size: [50, p.height - p.topThickness, 50],
        at: [x, (p.height - p.topThickness) / 2, z],
      }),
    ),
  ],
});
```

- `build` devuelve un **árbol de primitivas renderer-agnóstico** (box, cylinder, roundedBox, extrudedProfile, lathe…) en mm, con slot de material. El `viewer` las convierte a geometría y las agrupa por material (menos draw calls).
- La UI de propiedades se **genera automáticamente** desde el esquema de parámetros (sliders + input numérico + unidades). Un mueble nuevo no requiere UI nueva.
- **Evolución futura sin romper nada:** `build` podrá devolver también `model('sofa-chesterfield.glb', { slices })` (escalado por _9-slice_ 3D) para muebles realistas; el resto del sistema no cambia.

### 5.2 Definiciones de vanos (puertas/ventanas)

```ts
defineOpening({
  id: 'window.casement', version: 1,
  params: z.object({ width: mm(…), height: mm(…), sill: mm({ default: 900 }), panes: int({ default: 2 }) }),
  cut: (p) => rectProfile(p.width, p.height, p.sill),   // perfil 2D que se resta del muro
  build: (p) => [ /* marco, hojas, vidrio */ ],
  passable: false,                                      // puertas: true (para colisiones)
});
```

El **perfil de corte es un polígono**, no un rectángulo fijo → ventanas en arco, ojos de buey, etc., llegan sin cambiar el generador de muros.

### 5.3 Definiciones de materiales

```ts
defineMaterial({
  id: 'floor.laminate.oak', version: 1,
  surfaces: ['floor'],                                  // floor | wall | ceiling | item
  maps: { albedo: 'oak_albedo.ktx2', normal: '…', roughness: '…', ao: '…' },
  tileSize: [1200, 200],                                // tamaño físico real (mm) de una repetición
  tintable: true,                                       // el color del usuario se multiplica
  params: { groutColor?: …, pattern?: 'straight' | 'herringbone' },
});
```

Las UV de muros y pisos se generan **en coordenadas de mundo (mm)**, así una baldosa de 60×60 cm mide 60×60 cm en cualquier muro, sin importar su tamaño.

### 5.4 _Affordances_ de interacción (habilita "sentarse", "acostarse"…)

Las definiciones pueden declarar desde ya puntos de interacción, aunque el jugador aún no los use:

```ts
interactions: (p) => [
  { kind: 'sit',  anchor: [0, p.seatHeight, p.depth * 0.1], facing: 0, eyeHeight: p.seatHeight + 750 },
  { kind: 'lie',  anchor: […], facing: …, requires: ['bed'] },
],
```

El controlador del jugador es una **máquina de estados (XState)**: `walking ⇄ sitting ⇄ lying`, con transiciones animadas. Agregar una interacción nueva = registrar un nuevo `InteractionHandler` + estado, sin modificar los existentes.

### 5.5 Emisores de luz

```ts
emitters: (p) => [
  {
    kind: 'point',
    at: [0, p.height - 120, 0],
    intensity: 800 /* lm */,
    color: '#FFE8C4',
    castShadow: 'auto',
  },
];
```

Lámparas, apliques y focos son items con emisores. El _viewer_ aplica un **presupuesto de luces** (cuántas proyectan sombra) para mantener el rendimiento.

### 5.6 Modos de navegación y herramientas como registros

```ts
interface NavigationMode { id: string; enter(ctx): void; exit(): void; update(dt: number): void; }
navigationRegistry.register(editMode, ghostMode, personMode /*, futuro: vrMode, tourMode */);

interface EditorTool { id: string; cursor; onPointerDown…; panel?: Component; }
toolRegistry.register(selectTool, drawWallTool, placeItemTool, measureTool);
```

### 5.7 Import/Export y migraciones

- Pipeline de carga: `parse → detectar versión → migrar paso a paso (v1→v2→…→actual) → validar Zod → normalizar → cargar`.
- Errores de validación **reportados al usuario con ruta del campo** (ej. `levels[0].walls[3].thickness debe ser > 0`).
- Formatos: `.decodeny.json` (solo datos) y `.decodeny.zip` (JSON + `assets/` cuando hay imágenes). Registro de formatos para agregar en el futuro glTF, IFC, DXF, etc.
- Test obligatorio de **round-trip**: `import(export(doc)) ≡ doc` (property-based con fast-check sobre documentos generados aleatoriamente).

---

## 6. Roadmap por iteraciones

Formato de cada iteración: **objetivo → alcance → tareas técnicas → criterios de aceptación**. Las _user stories_ se derivan a issues al iniciar cada iteración.

### I0 — Fundaciones

**Objetivo:** que escribir la primera feature sea rápido y correcto.

- `git init`, monorepo pnpm + Turborepo, paquetes `domain`, `catalog`, `viewer`, `apps/web` vacíos pero conectados.
- TypeScript strict, ESLint, Prettier, Husky + lint-staged, commitlint, Changesets.
- dependency-cruiser con reglas de capas.
- Vitest configurado por paquete; Playwright con una prueba "la app carga y muestra un canvas".
- GitHub Actions: `lint → typecheck → test → build → e2e` (sin despliegue hasta definir hosting).
- i18next con `es` como idioma base.
- ADRs iniciales: 001 stack 3D (R3F), 002 unidades en mm, 003 documento como fuente de verdad, 004 catálogo paramétrico, 005 física con Rapier.
- `README`, `CONTRIBUTING`, plantilla de PR con Definition of Done.

**Aceptación:** PR de ejemplo pasa CI completo y se despliega en preview; escena R3F vacía con grilla y luz.

---

### I1 — Núcleo: espacio por medidas + render + export/import ⭐ MVP

**Objetivo:** el usuario describe su espacio con medidas y lo ve en 3D; puede guardarlo y abrirlo.

**Alcance funcional**

1. **Crear recinto rectangular** por formulario: ancho × largo × alto de muros, grosor de muro.
2. **Crear recinto poligonal por indicaciones** tipo "tortuga": secuencia de tramos `longitud + giro` (ej. `4,20 m → 90° → 3,10 m → 90° → …`), con cierre automático y aviso si no cierra.
3. Lista de muros editables: largo, alto, grosor; edición numérica de coordenadas de nodos.
4. Varios recintos en el mismo nivel; los adosados comparten tabique (adelantado de I7, ADR-0007).
5. Render 3D: muros con esquinas en inglete correctas, piso y cielo poligonales (cielo ocultable), colores planos por defecto.
6. Cámara de edición: órbita + vista superior; encuadre automático del proyecto.
7. **Cotas** básicas: etiqueta de largo sobre cada muro seleccionado.
8. **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z) en todas las acciones.
9. **Exportar/Importar** `.decodeny.json`; **autoguardado** en IndexedDB y recuperación al reabrir.
10. Nuevo proyecto / renombrar proyecto.

**Tareas técnicas**

- `domain`: esquemas Zod v1, comandos, store con patches de Immer, migración identidad v1, geometría: offset de polilíneas, ingletes, polígono de recinto, validación de auto-intersección.
- `viewer`: `WallBuilder` (perfil 2D del muro con agujeros → `ExtrudeGeometry`; ya preparado para vanos), `FloorBuilder` (earcut), UV en coordenadas de mundo.
- `web`: panel de recintos, formulario rectangular, editor de tramos, panel de propiedades, barra superior (archivo, deshacer).

**Aceptación**

- Un departamento de 3 recintos ingresado solo con medidas se ve correcto (esquinas cerradas, medidas reales verificables con la cota).
- Exportar → recargar página → importar → estado idéntico (test E2E + round-trip property test).
- Archivo inválido muestra error comprensible sin romper la app.
- Cobertura `domain` ≥ 90 %.

---

### I2 — Navegación: modo persona y modo fantasma

**Objetivo:** recorrer el espacio de forma inmersiva.

**Modo persona**

- Altura total 1,70 m; **ojos a ~1,60 m** (configurable en ajustes para futuros perfiles: niño, silla de ruedas…).
- Pointer lock + WASD/flechas, mouse para mirar, Shift para trotar (≈1,4 m/s caminando, ≈3 m/s trotando).
- Rapier: character controller kinemático con cápsula (radio ≈0,25 m), gravedad, _step offset_ (preparado para escaleras futuras), deslizamiento contra muros.
- Colliders generados automáticamente desde el documento (muros por tramos entre vanos, piso, luego muebles).
- Punto de aparición: centro del recinto seleccionado o "click en el piso para aparecer aquí" ✅.
- Balanceo de cabeza opcional (apagado por defecto; accesibilidad/mareo) ✅.

**Modo fantasma (vista libre)**

- Vuelo libre sin colisiones ni gravedad; atraviesa muros; subir/bajar (Espacio / C o Q/E), rueda del mouse ajusta velocidad.

**Transversal**

- Máquina de estados de navegación (XState): `edit ⇄ ghost ⇄ person`, tecla rápida (ej. `1/2/3`) y botón en barra; la transición anima la cámara.
- HUD mínimo: modo actual, ayuda de controles, tecla Esc para salir.
- Física cargada en _lazy_ (solo al entrar en modo persona).

**Aceptación:** en modo persona no se puede atravesar muros ni caer del piso; en fantasma sí se puede atravesar; 60 fps en laptop de gama media con el proyecto de referencia.

---

### I3 — Puertas y ventanas

**Objetivo:** vanos reales en muros, usando el catálogo extensible.

- Catálogo inicial: puerta simple batiente, puerta doble, puerta corredera, vano libre (sin hoja); ventana fija, ventana corredera, ventana de abatir, ventanal piso-cielo.
- Colocación: elegir muro + offset numérico (o arrastrar a lo largo del muro con snapping a 1 cm/5 cm/10 cm); parámetros ancho, alto, antepecho, lado de bisagra, sentido de apertura.
- Validaciones de dominio: el vano no excede el muro ni se superpone a otro vano (feedback visual en rojo).
- Generador de muros resta los perfiles de corte; colliders del muro respetan el vano; puertas son transitables en modo persona (`passable`).
- Vidrio con material transparente/físico; arco de apertura visible en vista superior.
- **Preparado para futuro:** estado `open/closed` en params (animar/abrir puertas en modo persona en el backlog).

**Aceptación:** caminar de un recinto a otro por la puerta en modo persona; mover el muro mueve sus vanos; agregar un tipo de ventana nuevo requiere solo un archivo en `catalog` (verificado en revisión de PR).

---

### I4 — Muebles genéricos paramétricos

**Objetivo:** amoblar con piezas genéricas que se ajustan a las medidas del usuario.

**Catálogo inicial (paramétrico: ancho, profundidad, alto + parámetros propios)**

- Mesas: rectangular, redonda, de centro.
- Sillas: silla de comedor, silla de escritorio (simplificada).
- Sofás y sillones: sofá recto (n.º de cuerpos), sofá en L, sillón.
- Escritorios: simple, con cajonera.
- Camas: individual, 1,5 plazas, 2 plazas, king (presets de medidas) + velador.
- Baño: inodoro, lavamanos (pedestal/mueble), ducha (plato + mampara), tina.
- Almacenamiento (barato y muy útil): clóset, estante, cómoda.

**Funcionalidad**

- Panel de catálogo con búsqueda y categorías; thumbnails generados automáticamente desde la definición (render offscreen).
- Colocar: click en el piso; mover/rotar con gizmo restringido al plano (snapping de rotación 15°/90°); **entrada numérica** de posición, rotación y medidas (es la forma principal: el usuario conoce sus medidas).
- Presets de medidas por definición ("cama 2 plazas: 1400 × 1900").
- Snapping a muros (pegar respaldo al muro) y a otros muebles.
- Duplicar, eliminar, copiar/pegar; selección múltiple.
- Detección de superposición (advertencia visual, no bloqueo).
- Colliders de muebles en modo persona (por pieza o bounding box simplificada).
- Instancing automático cuando hay muchos muebles iguales.
- **Affordances declaradas** (`sit`, `lie`) en sillas, sofás, camas, aunque aún no se usen.
- **Playground de catálogo** (ruta de desarrollo): cada definición con sliders de todos sus parámetros — herramienta clave para que el equipo de contenido escale el catálogo.

**Notas de implementación:** ajuste a otros muebles ✅ (se juntan cara a cara y alinean bordes; contra un muro, se deslizan a lo largo de él). Selección múltiple ✅ (Shift/Ctrl + clic, recuadro en la planta, Ctrl+A; mover, girar, duplicar, copiar y borrar en grupo). Miniaturas por render offscreen, instancing y el playground de catálogo quedan pendientes (hoy: íconos por categoría y la propia app como playground). Medidas libres desde 10 cm (ver `comfortMin` en arquitectura).

**Aceptación**

- Test automático de catálogo: **cada definición registrada** construye sin NaN ni geometría degenerada con params default/min/max, y su bounding box coincide con `width/depth/height` (±1 mm). Este test escala solo con el contenido.
- Cambiar el ancho de una mesa no cambia el grosor de sus patas.

---

### I5 — Materiales: color y texturas de muros y suelos

**Objetivo:** personalizar acabados con realismo razonable.

- Catálogo inicial:
  - Muros: pintura mate, pintura satinada, papel mural (2–3), ladrillo a la vista, cerámica de baño, hormigón.
  - Pisos: piso flotante (roble, nogal, gris), parquet (recto y espiga), porcelanato, cerámica (varios tamaños), alfombra, vinílico, hormigón pulido.
  - Cielo: pintura.
- **Color ajustable** (selector + paleta de colores recientes del proyecto) multiplicando el albedo en materiales `tintable`; color de fragüe en cerámicas.
- Escala y rotación de la textura por instancia (ej. dirección de las tablas del piso).
- Asignación por **cara de muro** (interior/exterior distinto), por recinto (piso) o por muro completo; herramienta "cuentagotas" (copiar material de una superficie a otra).
- Pipeline de assets: script que toma texturas fuente → KTX2 + mipmaps + thumbnail; carga diferida y caché compartido; texturas de baja resolución primero.
- Iluminación base mejorada: environment map (HDRI interior suave), tone mapping ACES/AgX, sombras suaves de la luz principal.

**Notas de implementación:** texturas procedurales a escala física en lugar de fotografías KTX2 (ADR-0008); el pipeline KTX2 pasa al backlog como un tipo de patrón más.

**Aceptación:** un porcelanato 60×60 mide 60×60 en cualquier superficie; cambiar el color es instantáneo (< 16 ms); agregar una textura nueva = carpeta con mapas + archivo de definición.

---

### I6 — Decoración e iluminación

**Objetivo:** completar la ambientación.

- **Luces:** foco embutido, plafón, colgante, riel; apliques de muro; lámpara de pie y de mesa (items con emisor). Parámetros: intensidad (lm), temperatura de color (K) o color, encendido/apagado.
- **Cuadros:** montaje en muro, medidas y marco paramétricos, **imagen subida por el usuario** (guardada como asset; exportación `.zip`).
- **Otros:** espejos, plantas (genéricas en maceta, paramétricas en alto), alfombras (con material propio), cortinas, repisas.
- Tipos de montaje completos: `wall` (se pega a la cara del muro, altura desde el piso), `ceiling`, `surface` (lámpara sobre escritorio: se apoya sobre el mueble).
- Presupuesto de luces: máx. N luces con sombra (prioridad por cercanía a la cámara), el resto sin sombra; modo "día/noche" (luz ambiente exterior a través de ventanas).

**Notas de implementación:** las luminarias no proyectan sombras (presupuesto: hasta 12 luces simultáneas sin sombra); un presupuesto de sombras por cercanía queda para I8. Las cortinas se montan en muro desde el piso.

**Aceptación:** apagar/encender luces se refleja en tiempo real; un cuadro con foto propia sobrevive a export/import `.zip`; rendimiento dentro de presupuesto con 15 luces.

---

### I7 — Edición avanzada

- **Vista de planta 2D** (SVG/Canvas, sincronizada con el mismo documento): dibujar muros con click + entrada numérica de longitud, arrastrar nodos, cotas automáticas.
- ~~Muros compartidos entre recintos y uniones en T~~ (adelantado a I2.5, ADR-0007); cruces en X y muros sueltos ✅ (herramienta «Dibujar muros», tecla `W`).
- Detección automática de recintos a partir del grafo de muros (ciclos mínimos) ✅: al cerrar un contorno se crea el recinto; un tabique que cruza un recinto lo divide (la parte mayor conserva nombre y terminaciones); borrar el muro que separa dos recintos los une.
- Herramienta de medición (distancia entre dos puntos en 3D y 2D) ✅, área de recintos (m²) ✅.
- Plantillas de inicio (estudio, 1D1B, 2D2B).
- Capas/visibilidad (ocultar cielo, muebles, decoración), "corte" de muros a media altura en vista de edición.
- Capturas de pantalla (PNG) desde cualquier modo.

### I8 — Endurecimiento para producción

- Rendimiento: perfiles con `r3f-perf`, _frameloop on-demand_ en edición, BVH para raycasts, LOD de texturas, presupuestos verificados en CI (bundle size, tiempo de carga).
- Móvil/tablet: controles táctiles (joystick virtual en modo persona), UI responsiva.
- Accesibilidad: navegación por teclado de toda la UI, contraste, `prefers-reduced-motion`, textos alternativos.
- PWA/offline ✅ (service worker propio generado en el build, sin dependencias; precarga todo el build y avisa cuando hay una versión nueva), manejo de errores con _error boundaries_ ✅ y reporte (Sentry), telemetría anónima opt-in (requieren hosting).
- i18n completo (es/en), formateo de unidades (m/cm, opcional pies/pulgadas).

---

## 7. Backlog futuro (ya habilitado por la arquitectura)

| Funcionalidad                                                       | Qué la habilita hoy                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sentarse, acostarse, apoyarse                                       | Affordances en definiciones (§5.4) + máquina de estados del jugador |
| Abrir/cerrar puertas y ventanas en modo persona                     | `params.open` en vanos + colliders dinámicos                        |
| Multi-piso y escaleras                                              | `levels[]` en el documento + `step offset` del controller           |
| Muebles realistas (GLB)                                             | `build` puede devolver `model(…)` con 9-slice                       |
| Ventanas en arco, puertas especiales                                | Perfil de corte poligonal (§5.2)                                    |
| Más materiales (mármol, piedra, madera natural)                     | Catálogo de materiales + pipeline KTX2                              |
| Compartir proyecto por link / guardado en la nube                   | Documento serializable + capa de persistencia intercambiable        |
| Colaboración en tiempo real                                         | Comandos + patches (migrables a CRDT, ej. Yjs)                      |
| WebXR (visores VR)                                                  | `NavigationMode` registrable                                        |
| Ingreso por lenguaje natural ("living de 4×5 con ventana al norte") | Los comandos de dominio son una API invocable por un LLM            |
| Importar planos (imagen de fondo a escala, DXF)                     | Registro de formatos de import                                      |
| Exportar glTF/OBJ, presupuesto de materiales (m² de piso/pintura)   | Documento con medidas reales + registro de formatos de export       |
| Recorridos guiados / tours                                          | `NavigationMode` + rutas de cámara                                  |
| Marketplace / packs de contenido                                    | Catálogo por registros + definiciones versionadas                   |

---

## 8. Estándares de ingeniería

### 8.1 Pirámide de tests

- **Unitarios (Vitest):** dominio, geometría, migraciones, comandos. Property-based (fast-check) para geometría de muros e import/export.
- **Contrato de catálogo:** test parametrizado que recorre todo el registro (§I4).
- **Snapshot de geometría:** _golden files_ de descriptores de muros/muebles para detectar regresiones.
- **E2E (Playwright):** flujos críticos — crear recinto, colocar mueble, exportar/importar, cambiar de modo.
- **Regresión visual:** capturas de escenas de referencia con render determinista (WebGL en Chromium headless), umbral de diferencia.

### 8.2 Definition of Done (por PR)

- [ ] Tipos estrictos, sin `any` ni `@ts-ignore` injustificados.
- [ ] Tests nuevos/actualizados; CI en verde.
- [ ] Sin strings de UI hardcodeados (i18n).
- [ ] Si cambia el esquema del documento: `schemaVersion` + migración + test de migración.
- [ ] Si cambia una definición de catálogo de forma incompatible: nueva versión `@n+1` + migración de params.
- [ ] Docs/ADR actualizados si hay decisión de arquitectura.
- [ ] Revisado manualmente en local (`pnpm dev`).

### 8.3 Flujo de trabajo

- Trunk-based con ramas cortas (`feat/…`, `fix/…`), PRs pequeños, Conventional Commits, squash merge.
- Una iteración = un milestone de GitHub; issues con criterios de aceptación; demo al cierre.
- Changesets → versión SemVer + CHANGELOG por release.

### 8.4 Presupuestos de rendimiento (proyecto de referencia: depto 100 m², 80 items, 15 luces)

- 60 fps en laptop de gama media (GPU integrada reciente); ≥ 30 fps en móvil de gama media.
- Carga inicial < 3 s (JS inicial < 400 KB gzip; física, catálogo y texturas en _lazy_).
- < 300 draw calls; ≤ 4 luces con sombra simultáneas; memoria de texturas < 256 MB.

---

## 9. Riesgos y mitigaciones

| Riesgo                                                                                      | Impacto | Mitigación                                                                                            |
| ------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Geometría de muros (uniones múltiples, vanos cerca de esquinas) más compleja de lo previsto | Alto    | Grafo desde I1 pero uniones de grado > 2 recién en I7; tests property-based; casos borde documentados |
| Rendimiento con muchas luces/sombras                                                        | Alto    | Presupuesto de luces, sombras solo de luces cercanas, futura opción de _baking_                       |
| Crecimiento del catálogo degrada calidad                                                    | Medio   | Test de contrato automático + playground + guía `adding-content.md`                                   |
| Cambios de esquema rompen archivos de usuarios                                              | Alto    | Migraciones obligatorias, tests con fixtures de cada versión publicada                                |
| Licencias de texturas/modelos                                                               | Medio   | Solo CC0 o propias; archivo de atribución/licencia por asset                                          |
| Mareo en modo persona                                                                       | Bajo    | Head-bob apagado por defecto, FOV configurable, reduced-motion                                        |

---

## 10. Decisiones de producto (resueltas 2026-10-25)

1. **Nombre:** Decodeny (paquetes `@decodeny/*`).
2. **Hosting:** pendiente; por ahora solo local (CI sin pasos de despliegue).
3. **Móvil:** fuera de las iteraciones actuales, pero la UI se construye responsiva y sin depender de hover/teclado exclusivamente, para habilitar táctil en I8.
4. **Unidades:** solo sistema métrico.
5. **Público objetivo:** corredores de propiedades → priorizar ingreso rápido de medidas, presentación al cliente (capturas, recorridos) y compartir.
