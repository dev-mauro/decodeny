# Decodeny — Plan de desarrollo

> **Estado (2026-10-27):** I0 ✅ · I1 ✅ · I2 ✅ · muros compartidos y arrastre (adelantados de I7) ✅ · I3 ✅ · I4 ✅ · I5 ✅ · I6 ✅ · I7 ✅ · I8 🟡 (errores, WebGL, movimiento reducido, inglés, PWA/offline, presupuestos de bundle, carga inicial y draw calls en CI y móvil/táctil ✅; pendientes: telemetría y reporte de errores —requieren un servicio externo— y la meta de < 300 draw calls con 80 muebles —requiere agrupar muebles—) · colaboración en tiempo real ✅ (ADR-0011) · **Fase 2 (§11):** I9 ✅ · I10 ✅ · I10b iluminación e I10c salas de colaboración planificadas (antes de I11) · I11–I12 planificadas · I13–I14 pendientes/opcionales (de I14, adelantados: presentación y puertas en el recorrido).

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
3. Lista de muros editables: largo, alto, grosor; edición numérica de coordenadas de nodos ✅ (extremos del muro en su inspector).
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
- Instancing automático cuando hay muchos muebles iguales. _Parcial:_ las piezas de cada mueble (y de cada vano) se fusionan por material, ~40 % menos draw calls (sample: 711 → 403); presupuesto vigilado en E2E (`perf-budget.spec.ts`). Para la meta de < 300 con 80 muebles falta agrupar los muebles estáticos (`BatchedMesh`).
- **Affordances declaradas** (`sit`, `lie`) en sillas, sofás, camas, aunque aún no se usen.
- **Playground de catálogo** (ruta de desarrollo): cada definición con sliders de todos sus parámetros — herramienta clave para que el equipo de contenido escale el catálogo.

**Notas de implementación:** ajuste a otros muebles ✅ (se juntan cara a cara y alinean bordes; contra un muro, se deslizan a lo largo de él). Selección múltiple ✅ (Shift/Ctrl + clic, recuadro en la planta, Ctrl+A; mover, girar, duplicar, copiar y borrar en grupo). Miniaturas por render offscreen ✅ (un renderer compartido, de a una por cuadro; sin WebGL, ícono). Instancing y el playground de catálogo quedan pendientes (hoy la propia app sirve de playground). Medidas libres desde 10 cm (ver `comfortMin` en arquitectura).

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

**Notas de implementación:** presupuesto de luces por cercanía a la cámara ✅: hasta 12 luminarias encendidas y, de noche, sombra en las 3 más cercanas (los muros no proyectan sombra, para que el sol no oscurezca los recintos sin techo). Las cortinas se montan en muro desde el piso.

**Aceptación:** apagar/encender luces se refleja en tiempo real; un cuadro con foto propia sobrevive a export/import `.zip`; rendimiento dentro de presupuesto con 15 luces.

---

### I7 — Edición avanzada

- **Vista de planta 2D** (SVG/Canvas, sincronizada con el mismo documento): dibujar muros con click + entrada numérica de longitud, arrastrar nodos, cotas automáticas.
- ~~Muros compartidos entre recintos y uniones en T~~ (adelantado a I2.5, ADR-0007); cruces en X y muros sueltos ✅ (herramienta «Dibujar muros», tecla `W`).
- Detección automática de recintos a partir del grafo de muros (ciclos mínimos) ✅: al cerrar un contorno se crea el recinto; un tabique que cruza un recinto lo divide (la parte mayor conserva nombre y terminaciones); borrar el muro que separa dos recintos los une.
- Herramienta de medición (distancia entre dos puntos en 3D y 2D) ✅, área de recintos (m²) ✅.
- Plantillas de inicio (estudio, 1D1B, 2D2B).
- Capas/visibilidad (ocultar cielo, muebles, decoración), "corte" de muros a media altura en vista de edición. Opciones ✅: corte de muros (solo la envolvente; los muebles quedan enteros), cuadrícula de trabajo con ancho elegible (también fija el paso de los ajustes) y modo solo lectura.
- Capturas de pantalla (PNG) desde cualquier modo.

### I8 — Endurecimiento para producción

- Rendimiento: perfiles con `r3f-perf`, _frameloop on-demand_ en edición ✅, BVH para raycasts, LOD de texturas, presupuestos verificados en CI ✅ (tamaño por chunk y JS inicial < 400 kB gzip; la vista 3D, las miniaturas y la física se cargan bajo demanda: hoy la carga inicial pesa ~225 kB).
- Móvil/tablet ✅: layout móvil (vista a pantalla completa, paneles como hojas desde una barra inferior, menú compacto), controles táctiles del recorrido y el vuelo (joystick, deslizar para mirar, subir/bajar), pellizcar para hacer zoom en la planta, y equivalentes táctiles de los atajos (Dejar aquí, Girar, Cancelar, Terminar). Pendiente: selección múltiple táctil (hoy Shift/Ctrl) y escribir el largo al dibujar muros (en táctil se corrige después en el inspector).
- Accesibilidad: navegación por teclado de toda la UI, contraste, `prefers-reduced-motion`, textos alternativos.
- PWA/offline ✅ (service worker propio generado en el build, sin dependencias; precarga todo el build y avisa cuando hay una versión nueva), manejo de errores con _error boundaries_ ✅ y reporte (Sentry), telemetría anónima opt-in (requieren hosting).
- i18n completo (es/en), formateo de unidades (m/cm, opcional pies/pulgadas).

---

## 7. Backlog futuro (ya habilitado por la arquitectura)

| Funcionalidad                                                         | Qué la habilita hoy                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sentarse, acostarse, apoyarse                                         | Affordances en definiciones (§5.4) + máquina de estados del jugador |
| Abrir/cerrar puertas y ventanas en modo persona                       | `params.open` en vanos + colliders dinámicos                        |
| Multi-piso, escaleras y ascensores (planificado: I12)                 | `levels[]` en el documento + `step offset` del controller           |
| Muebles realistas (GLB) (planificado: I11, ADR-0013)                  | `build` puede devolver `model(…)` con 9-slice                       |
| Ventanas en arco, puertas especiales                                  | Perfil de corte poligonal (§5.2)                                    |
| Más materiales (mármol, piedra, madera natural)                       | Catálogo de materiales + pipeline KTX2                              |
| Compartir por link / guardado en la nube (planificado: I10, ADR-0012) | Documento serializable + capa de persistencia intercambiable        |
| Colaboración en tiempo real ✅ (WebRTC, ADR-0011)                     | Comandos + patches (migrables a CRDT, ej. Yjs)                      |
| WebXR (visores VR)                                                    | `NavigationMode` registrable                                        |
| Ingreso por lenguaje natural ("living de 4×5 con ventana al norte")   | Los comandos de dominio son una API invocable por un LLM            |
| Importar planos (imagen de fondo a escala, DXF)                       | Registro de formatos de import                                      |
| Exportar glTF/OBJ, presupuesto de materiales (m² de piso/pintura)     | Documento con medidas reales + registro de formatos de export       |
| Recorridos guiados / tours                                            | `NavigationMode` + rutas de cámara                                  |
| Marketplace / packs de contenido                                      | Catálogo por registros + definiciones versionadas                   |

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
2. **Hosting:** GitHub Pages (2026-10-26): la rama `prod` recibe el build de cada push a `main` con la CI en verde. Ningún otro hosting; Firebase se usaría solo como base de datos (ADR-0012).
3. **Móvil:** fuera de las iteraciones actuales, pero la UI se construye responsiva y sin depender de hover/teclado exclusivamente, para habilitar táctil en I8.
4. **Unidades:** solo sistema métrico.
5. **Público objetivo:** corredores de propiedades → priorizar ingreso rápido de medidas, presentación al cliente (capturas, recorridos) y compartir.

---

## 11. Fase 2 — calidad de producto y nube (planificada 2026-10-27)

### 11.1 Lo que falta, por impacto para corredores

Contrastado con §6–§7. **Alta:** cambia lo que se puede mostrar o cómo se comparte. **Media:** mejora notable de calidad. **Base:** infraestructura y deuda.

| Prioridad | Característica                                                                                                               | Por qué                                                                       | Dónde          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- |
| Alta      | **Corte inteligente de muros** (sub-opción del corte)                                                                        | Ver el interior desde afuera sin perder los muros del fondo, como una maqueta | I9             |
| Alta      | **Casas en la nube + enlace + forks**                                                                                        | Compartir es un enlace, no un archivo                                         | I10 (ADR-0012) |
| Alta      | **Muebles personalizados**                                                                                                   | El mueble real del cliente (o de la tienda) en la casa                        | I11 (ADR-0013) |
| Alta      | **Varias plantas, escaleras, ascensores y dobles alturas**                                                                   | Casas de 2+ pisos, dúplex, departamentos con escalera interior                | I12            |
| Alta      | **Plano de fondo a escala** (imagen o PDF del plano de la inmobiliaria, calibrado con una medida conocida) para calcar muros | La forma más rápida de pasar un plano existente a 3D                          | I13            |
| Alta      | **Ficha exportable**: plano con cotas y m² por espacio, capturas y datos del proyecto en PDF/PNG                             | Lo que el corredor publica o envía                                            | I13            |
| Alta      | **Modo presentación**: vistas guardadas, recorrido guiado entre ellas, solo lectura y UI mínima                              | Mostrar al cliente sin herramientas a la vista                                | I14            |
| Media     | Abrir y cerrar puertas y ventanas en el recorrido                                                                            | Realismo; `params.open` ya previsto                                           | I14            |
| Media     | Exterior: techumbre (cubierta a 1, 2 o 4 aguas), terraza, balcón, terreno y jardín, cierres                                  | Las casas se ven incompletas desde afuera                                     | backlog        |
| Media     | Elementos estructurales: pilares, vigas, cielos a distinta altura, muros curvos, zócalos y molduras                          | Departamentos reales los tienen                                               | backlog        |
| Media     | Orientación norte y sol por fecha y hora (asoleamiento)                                                                      | Argumento de venta frecuente («luz de la tarde»)                              | backlog        |
| Media     | Sentarse y acostarse                                                                                                         | Afordancias ya declaradas en el catálogo                                      | backlog        |
| Media     | Selección múltiple táctil y escribir largos en táctil                                                                        | Pendientes de I8                                                              | backlog        |
| Media     | Materiales fotográficos (KTX2), más pisos y revestimientos                                                                   | Realismo de terminaciones                                                     | backlog        |
| Base      | `BatchedMesh` para < 300 draw calls con 80 muebles                                                                           | Meta de §8.4 pendiente                                                        | backlog        |
| Base      | Telemetría opt-in y reporte de errores                                                                                       | Con Firebase en el proyecto, Analytics es opcional                            | después de I10 |
| Base      | Changesets (CHANGELOG), playground del catálogo, regresión visual                                                            | Escalar contenido y versiones                                                 | backlog        |
| Base      | Accesibilidad: toda la UI por teclado, foco visible, textos alternativos                                                     | Pendiente de I8                                                               | backlog        |

### I9 — Corte inteligente de muros (S) ✅

**Objetivo:** con el corte activo, recortar solo los muros que tapan el interior desde la cámara. El muro del fondo, que da hacia afuera y se ve desde adentro, queda entero. El primer muro desde la cámara, aunque también dé hacia afuera, se recorta.

- **Opción:** «Corte de muros» pasa a tener modo `todos` (hoy) o `los que tapan` (nuevo, recordado en Opciones).
- **Clasificación (dominio, pura):** para cada muro, qué caras dan a un espacio (`roomOnWallFace`). Si una cara da a un espacio y la otra no, es **exterior** con su normal hacia afuera; si las dos dan a espacios, es **interior**; si ninguna, es **suelto**.
- **Regla por cuadro (visor, pura):** con la cámara en planta `c` y el punto medio del muro `p`:
  - Un muro exterior se corta si `dot(nAfuera, c − p) > 0`: la cámara está de su lado de afuera, así que tapa.
  - Si el producto es negativo, el muro se ve desde adentro y queda entero.
  - Los interiores se cortan siempre: tapan el interior.
  - Los sueltos siguen la regla exterior con la normal hacia la cámara.
  - Una histéresis angular (±5°) evita parpadeos con los muros casi de canto.
  - Con la cámara dentro de la casa, la misma regla deja enteros todos los perimetrales.
- **Render:** hoy el corte usa un arreglo global de planos (`SECTION_PLANES`) en los materiales de la envolvente. Cada material de muro y de vano pasa a tener dos variantes, con y sin recorte, que comparten texturas y caché. Cada muro elige la suya, y la tapa de sección se dibuja solo en los cortados.
- **Elementos de muro:** los cuadros y apliques montados en un muro entero ya no se ocultan aunque queden por encima de la altura de corte.
- **Recálculo:** solo cuando la cámara de edición cambia (marco bajo demanda) y solo si cambia el conjunto de muros cortados.
- **Aceptación:**
  - Tests unitarios de la clasificación y de la regla: cámara afuera de cada lado, adentro, muros de canto y muros sueltos.
  - E2E: al orbitar 180°, el muro cortado pasa a estar entero y el opuesto pasa a cortarse (se expone el conjunto cortado como atributo `data-` del visor, como `data-peers`).

### I10 — Maquetas y nube (L) — ADR-0012 ✅

**Notas de implementación:** las casas se llaman **Maquetas**: colección local en IndexedDB (se guardan solas) y **solo «Compartir» sube a la nube**; desde ahí se sincronizan. La sesión es la del autor (la maqueta está en su colección local); la nube lo confirma al guardar y, ante cualquier duda (otra pestaña, identidad perdida, vencida), los cambios quedan en una copia: nunca se pisan ni se pierden. Enlace `?maqueta=<id>`. Reglas desplegadas por workflow. Configuración en `docs/nube-firebase.md`.

1. **Puertos y adaptador en memoria:**
   - `Identity`, `HouseRepository` y `AssetRepository`.
   - `cloud-session` decide entre abrir, sincronizar, registrar la visita o hacer fork.
   - Unit tests con el adaptador en memoria.
2. **Adaptador Firebase bajo demanda:**
   - Auth anónima y `firestore/lite`.
   - El proyecto se guarda comprimido en `Bytes`; los assets van en trozos y direccionados por contenido.
   - Escritura con `rev` en una transacción.
   - Regla de dependency-cruiser: solo `features/cloud/firebase` importa `firebase/*`.
   - Presupuesto del chunk `cloud` en CI.
3. **Reglas** en `firebase/firestore.rules`, con tests en el emulador (job de CI con Firebase Emulator Suite).
4. **Interfaz:**
   - «Compartir» con el enlace `?casa=<id>` y el aviso de privacidad y de vencimiento.
   - Estado de guardado en la barra y aviso de fork.
   - «Mis casas», hoy con un registro local.
5. **Fork al primer cambio** de quien no es dueño (también dentro de una sesión colaborativa, a nombre del anfitrión), con `replaceState` de la URL.
6. **Limpieza:**
   - `cleanup.yml` diario y manual (con `dry-run`) + `scripts/cloud/cleanup.mjs`.
   - Borra las casas con más de 30 días sin visitas.
   - Barre los assets que ninguna casa referencia.
   - Se prueba contra el emulador.
7. **Configuración:**
   - Variables `VITE_FIREBASE_*` en el workflow de Pages.
   - Sin ellas, la nube queda desactivada y la app funciona como hoy.

**Aceptación:**

- E2E con el emulador: crear una casa, abrir el enlace en otro contexto y verla igual (también con un cuadro con foto).
- E2E: editar desde el otro contexto crea un fork y el original no cambia.
- E2E: el dueño sigue editando el original.
- La limpieza borra solo lo vencido.
- La carga inicial no crece.

**Requiere del dueño del repo:**

- Crear el proyecto de Firebase en plan Spark con Firestore y Auth anónima.
- Cargar el secreto `FIREBASE_SERVICE_ACCOUNT` y las variables web.
- Decidir las preguntas abiertas del ADR-0012.

### I10b — Iluminación sin parpadeos (M) — antes de I11 ✅

**Notas de implementación:** hechos los puntos 1–7 (el 8, «calidad alta» con SSAO, queda opcional). El sol usa un mapa de 2048 encuadrado a la casa (texels de ~1 cm, en vez de ~2 cm con el cuadrado holgado) y bordes suaves (`shadow.radius`; en Three r186 el PCF admite radio). El cielo proyecta sombra en el recorrido y el vuelo.

**Diagnóstico** (capturas y código, 2026-10-28):

- **Parpadeo de día:** bajo los pisos hay un plano que recibe la sombra del sol (`shadowMaterial`, a −4 mm) y la cuadrícula decorativa (a −2 mm). El piso, además, se empuja hacia atrás en profundidad (`polygonOffset`) para que las alfombras ganen, así que queda pegado a ese plano.
  - La cámara usa `near` 0,05 m y `far` 2000 m (relación 1:40 000): a distancia de edición, la precisión de profundidad no separa milímetros.
  - El plano de sombra solo dibuja algo con sol, por eso parpadea de día y no de noche.
- **Alfombra que «pelea»:** es la misma falta de precisión. Una alfombra de pocos milímetros sobre el piso se alterna con él al orbitar.
- **Sombras raras:**
  - El cuadro de sombra del sol es un cuadrado fijo (2,6 × radio de la escena) con sesgos fijos: aparece _acne_ (rayas que tiemblan al mover la cámara) y despegues.
  - Los mapas de sombra (el sol y hasta 3 luminarias con mapa cúbico de 6 caras) **se vuelven a dibujar en cada cuadro** del recorrido, aunque nada se mueva.
- **Interior plano en el recorrido:** tres rellenos uniformes sumados (ambiente 0,45 + hemisferio 0,75 + entorno 0,55) borran el contraste. Además, los muebles no «apoyan»: no hay oscurecimiento de contacto.

**Plan** (cada punto neutro o positivo en rendimiento):

1. **Rango de profundidad ajustado:** en edición y vuelo, `near` y `far` se calculan con la distancia de la cámara y el tamaño del nivel (p. ej. `near` = distancia/250, `far` = distancia + 4 × radio). En el recorrido, `far` = 4 × radio del nivel. Gana 10–100× de precisión. Costo cero.
2. **Capas del suelo separadas de verdad:** el plano de sombra y la cuadrícula decorativa bajan a −2 cm / −1 cm, y el piso deja de empujarse hacia atrás. Lo plano (alfombras) se apoya 1 mm sobre el piso.
3. **Sombra del sol encuadrada y estable:**
   - El cuadro de sombra se ajusta a la caja del nivel vista desde el sol y se alinea a la grilla de texels (no tiembla).
   - Los sesgos se calculan con el tamaño del texel.
   - Filtrado suave (PCF soft) de bordes.
4. **Sombras estáticas:**
   - Se apaga `shadowMap.autoUpdate`. Los mapas se redibujan solo cuando cambia algo: el documento, una puerta que se mueve, la luz, el día o la noche, o el nivel.
   - Es un ahorro grande en el recorrido. Parte se reinvierte en calidad: mapa del sol de 4096 en escritorio y 2048 en móvil.
5. **Luces con transición:**
   - Al recalcular qué luminarias se encienden por cercanía, se interpola su intensidad en ~300 ms, en vez de que aparezcan o desaparezcan de golpe.
   - Margen (histéresis) para que no alternen en un límite.
6. **Equilibrio de la luz:**
   - Menos relleno uniforme, más entorno y hemisferio.
   - _Tone mapping_ AgX (o ACES ajustado) con exposición por modo: edición más clara, recorrido con más contraste.
   - El sol entra por las ventanas (el vidrio no hace sombra) y deja manchas de luz en el piso.
7. **Sombra de contacto barata:**
   - Bajo cada mueble de piso, un cuadrado con un degradado radial (una textura y un material compartidos, instanciado).
   - Los apoya en el piso sin postproceso, con ~1 draw call en total.
8. **Opcional, «calidad alta» (solo escritorio, desactivado en móvil):** oclusión ambiental en pantalla (SSAO/N8AO), bajo demanda, en edición y presentación.

**Aceptación:**

- Tests puros: rango de profundidad, encuadre del sol, histéresis de luces.
- E2E: con la cámara quieta, dos capturas consecutivas idénticas (sin parpadeo), y la orientación del parpadeo verificada con la alfombra del ejemplo desde lejos.
- `perf-budget.spec.ts` sin más draw calls.
- En el recorrido, los mapas de sombra no se redibujan con la escena quieta (se mide con `renderStats`).

### I10c — Salas de colaboración con código corto (M) — ADR-0014 ✅

**Notas de implementación:** la sala queda abierta para varios invitados (cada solicitud se borra al conectar, porque lleva direcciones IP). Sin la nube configurada, o con «Conectar a mano», el flujo es el de siempre (copiar y pegar). El SDK de Firestore con escuchas va en su propio chunk (`rooms`, ~133 kB gzip) y solo se descarga al colaborar.

- **Anfitrión:** crea una sala con un código de 6 letras y comparte el código o el enlace `?sala=…`.
- **Invitado:** escribe el código. Su oferta WebRTC y la respuesta del anfitrión viajan por Firestore, sin copiar ni pegar.
- **Seguridad:** las solicitudes las leen solo el invitado y el anfitrión, y se borran al conectar. Las salas vencen y las borra la limpieza diaria.
- **Alternativa:** la conexión a mano queda disponible para cuando no hay nube.
- **Aceptación:** tests de reglas en el emulador; E2E con dos navegadores que se unen por código.

### I11 — Muebles personalizados (L) — ADR-0013

1. **Documento:**
   - `schemaVersion` 2 con `customItems`, migración v1 → v2 y test con fixture.
   - Esquema Zod de `CustomItemSpec` y `compileCustomItem`.
   - El resolvedor `itemDefinitionFor(project, ref)` reemplaza los usos directos de `itemCatalog`.
   - El test de contrato se extiende con fast-check.
2. **Comandos:**
   - `addCustomItem` es idempotente y va en la misma transacción que la ubicación.
   - `replaceCustomItem`.
   - `deleteItems` quita las especificaciones que quedan sin uso.
3. **Biblioteca:** puerto `FurnitureLibrary` y adaptador IndexedDB (store `furniture`), con miniaturas.
4. **Interfaz:**
   - Submenú «Muebles personalizados»: crear, mi biblioteca y los de este proyecto.
   - Editor de piezas con vista previa y la opción «Partir de un mueble del catálogo».
   - «Guardar en mis muebles» y «Editar copia» en el inspector.
5. **Modelos 3D (segunda entrega):**
   - Primitiva `model` en `Part`.
   - Importar GLB/glTF con cargador bajo demanda: normaliza la escala, el frente y el origen, y aplica topes de tamaño y de triángulos.
   - El modelo viaja como asset por IndexedDB, nube (chunks) y WebRTC.

**Aceptación:**

- E2E: crear un mueble, ubicarlo, compartir el enlace, y en otro contexto verlo y guardarlo en su biblioteca.
- Durante una sesión colaborativa, el invitado ve el mueble personalizado del anfitrión.
- Exportar e importar `.zip` conserva modelos y especificaciones.

### I12 — Varias plantas, escaleras y ascensores (L)

El documento ya tiene `levels[]` con `elevation`, todos los comandos reciben `levelId` y la presencia de la colaboración ya informa el nivel.

1. **Dominio:**
   - Comandos `addLevel` (sobre el último, con la elevación sugerida = elevación + alto de muros + losa; opción de copiar el contorno del de abajo), `removeLevel`, `renameLevel`, `duplicateLevel` y `setLevelElevation`.
   - Ajuste `slabThickness`.
   - Las definiciones pueden declarar `floorOpening(params)`, un polígono que perfora la losa del nivel de arriba.
   - `levelVoids(project, level)` deriva los vanos de losa desde los elementos del nivel inferior (escaleras, ducto de ascensor, «vacío» para doble altura), sin datos duplicados.
   - Validación: que la escalera llegue a la elevación del nivel siguiente.
2. **Catálogo:**
   - Escaleras: recta, en L, en U y caracol.
     - Paramétricas: ancho, número de peldaños, huella y contrahuella calculadas con la regla de Blondel (2c + h ≈ 63 cm), y baranda.
     - La altura se toma de la diferencia entre niveles.
   - Ascensor:
     - Cabina y ducto; el parámetro `span` indica cuántos niveles sube.
     - Declara una afordancia nueva, `travel`.
   - Elemento «vacío».
3. **Visor:**
   - Se dibujan todos los niveles a su elevación.
   - En edición, el activo es editable, los de arriba se ocultan (casa de muñecas) y los de abajo se ven.
   - El cielo de un nivel es la losa del siguiente, con sus vanos.
   - En recorrido y vuelo se ve y se colisiona con todo.
   - Las escaleras colisionan como rampa (el controlador cinemático sube suave) y se ven con peldaños.
   - El plano muestra en tenue el nivel de abajo para alinear.
4. **Recorrido:**
   - Al pisar otra planta cambia el nivel activo, y con él el panel y la presencia.
   - En el ascensor, el HUD ofrece los pisos y anima la subida.
5. **Interfaz:**
   - Selector de planta en «Espacios» y en móvil.
   - Atajos `PgUp`/`PgDn`.
   - Los avatares de la colaboración se ven en todas las plantas durante el recorrido.

**Aceptación:**

- E2E: casa de 2 plantas con escalera en U.
- E2E: subir caminando en el recorrido, con el nivel activo cambiando.
- E2E: bajar en ascensor.
- Los vanos de losa coinciden con la escalera (test de dominio).

### I13 — Del plano existente a la ficha (M) — PENDIENTE / OPCIONAL

- **Plano de fondo a escala:**
  - Imagen o PDF (primera página).
  - Se calibra marcando dos puntos y escribiendo la distancia real.
  - Opacidad y bloqueo ajustables.
  - Se guarda como asset del nivel: es un dato del documento, así que viaja en el enlace.
- **Ficha:**
  - PNG o PDF del plano con cotas, nombres y m² por espacio y total, más capturas 3D elegidas.
  - Se arma en la app, sin servidor.

### I14 — Presentación (M) — PENDIENTE / OPCIONAL

Adelantado (mínimo, para mostrar) ✅: modo presentación (UI mínima, pantalla completa, solo lectura temporal, `?presentar=1`) y puertas operables en el recorrido (E o clic; F en el vuelo; botón en táctil). La puerta solo bloquea el paso **cerrada**: abierta o moviéndose se atraviesa. Su estado es del recorrido, no del documento (funciona en solo lectura y como invitado). Lo demás (vistas guardadas, recorrido guiado) queda pendiente.

- **Vistas guardadas:** pose de cámara + modo, en el documento.
- **Recorrido guiado:** interpolación entre las vistas guardadas.
- **Modo presentación:** solo lectura, UI mínima, a pantalla completa y con enlace directo `?casa=…&presentar=1`.
- **Puertas operables en el recorrido:**
  - Clic o tecla `E` para abrir o cerrar.
  - Colisión dinámica.
  - El estado se guarda en `params.open`.

### Orden y dependencias

```
I9 (independiente, rápido) ─┐
I10 nube ───────────────────┼─▶ I11 muebles (los modelos usan los assets de la nube)
                            └─▶ I13/I14 (el enlace de presentación usa la nube)
I12 plantas (independiente; conviene antes de I13 para que la ficha sea por planta)
```

Cada iteración sigue §8: rama corta, tests (unitarios, contrato y E2E), docs y ADR, y CI en verde antes de `main`. Los cambios de esquema van con migración.

### Preparado para cuentas (sin implementarlas)

| Hoy                                                | Mañana, con cuentas                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Identity` anónima de Firebase (uid por navegador) | La misma identidad enlazada a Google o correo (`linkWithCredential`): **el mismo uid**, nada que migrar |
| `houses.ownerUid` y reglas con `isOwner()`         | `members` con roles e `isMember(role)`; «Mis casas» = consulta por dueño                                |
| Registro local de «Mis casas»                      | Consulta en Firestore, y fusión del registro local al iniciar sesión                                    |
| `FurnitureLibrary` local (IndexedDB)               | `CloudFurnitureLibrary` (`users/{uid}/furniture`), con la local subida al iniciar sesión                |
| `CustomItemSpec.author` opcional                   | Autoría visible, catálogo compartido o marketplace                                                      |
| Documento sin datos de nube ni de usuario          | Igual: el documento sigue portable                                                                      |
