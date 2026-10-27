# ADR-0013: Muebles personalizados (en el documento y en una biblioteca propia)

- Estado: propuesta
- Fecha: 2026-10-27

## Contexto

Se pide que una persona pueda **incorporar su propio mueble**, que este viaje **dentro del documento** de la casa (quien abra el enlace o se una a la sesión también lo ve), que el catálogo tenga un submenú **«Muebles personalizados»** (crear uno + lista de los guardados en el navegador) y que, al tocar un mueble personalizado de una casa ajena, se ofrezca **«Guardar»** para sumarlo a la lista propia.

El catálogo actual es código (`defineItem` en `packages/catalog`, ADR-0004) y se consulta en un registro global estático (`itemCatalog`). Un mueble del usuario no puede ser código: tiene que ser **datos** y resolverse con el proyecto como contexto.

## Investigación

¿De qué está hecho un mueble propio? Tres caminos, de más barato a más caro:

| Camino                      | Qué es                                                                                                                                                                             | Peso en el documento                                         | Costo                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| A. **Compuesto**            | Piezas (cajas, cilindros) con medidas, posición y material, armadas en un editor. Se puede **partir de un mueble del catálogo** (se copian sus piezas con los parámetros actuales) | ~1–10 kB de JSON                                             | Bajo: reutiliza `Part`, `mergeParts`, miniaturas, materiales y colisiones                                     |
| B. **Modelo 3D** (GLB/glTF) | Un archivo exportado de SketchUp, Blender, IKEA, etc.                                                                                                                              | Asset binario (≤ 5 MB) fuera del JSON, referenciado por hash | Medio: cargador GLTF bajo demanda, normalización (escala, eje, origen), tope de triángulos, colisión por caja |
| C. Escaneo o foto           | Fotogrametría o IA                                                                                                                                                                 | —                                                            | Alto; fuera de alcance                                                                                        |

A y B comparten todo salvo la fuente de geometría, así que se modelan como **una sola especificación** con `source` discriminado. A va primero: no necesita assets nuevos, ya cabe en Firestore (ADR-0012) y en la colaboración (viaja como comando). B reutiliza el transporte de imágenes (IndexedDB local, chunks en la nube, `asset` por WebRTC), y la ADR-0004 ya preveía `model(…)` como primitiva.

## Decisión

### Documento (`schemaVersion` 2, con migración v1 → v2 que agrega `customItems: []`)

```ts
project.customItems: CustomItemSpec[]

interface CustomItemSpec {
  id: string;                    // 'custom.<hash12>' — hash del contenido canónico
  version: 1;                    // versión del formato de la especificación
  name: string;
  category: ItemCategory;        // el mismo vocabulario que el catálogo (búsqueda, capas)
  mount: ItemMount;              // floor | wall | ceiling | surface
  size: { width; depth; height };// envolvente por defecto (mm)
  resize: 'scale' | 'fixed';     // al cambiar medidas: escalar (como `comfortMin`) o no permitirlo
  solid: boolean;                // bloquea el paso en el recorrido
  slots: Record<string, { label: string; material: string }>;  // material por defecto de cada slot
  source:
    | { kind: 'composed'; parts: Part[] }             // camino A (mm, marco local del catálogo)
    | { kind: 'model'; assetId: string; bounds: …; triangles: number };  // camino B
  author?: { name?: string; uid?: string };           // preparado para cuentas (ADR-0012)
  createdAt: string;
}
```

- Un `Item` lo usa como cualquier otro: `def: 'custom.<hash12>@1'`. Inspector, arrastre, ajuste, avisos, selección múltiple, capas y materiales funcionan sin cambios.
- **Id por contenido:** el mismo mueble tiene el mismo id en todas las casas y bibliotecas, así «Guardar» no duplica y un fork lo comparte. Editarlo produce otra especificación (otro id); el editor ofrece reemplazar las copias del proyecto (`replaceCustomItem`, un solo paso de deshacer).
- **Comandos:** `addCustomItem` (idempotente: si el id existe no hace nada) se ejecuta en la misma transacción que el `addItem` que lo coloca; `deleteItems` quita las especificaciones que quedaron sin uso. Al ser comandos, la colaboración los sincroniza sin código nuevo.
- **Límites validados por Zod:** ≤ 300 piezas, medidas dentro de los rangos del catálogo; modelos ≤ 5 MB y ≤ 100 000 triángulos.

### Resolución de definiciones con el proyecto como contexto

`itemDefinitionFor(project, ref)` (catálogo): busca en `itemCatalog` y si no, compila la especificación (`compileCustomItem(spec) → AnyItemDefinition`, memoizada por id). Los usos directos de `itemCatalog.get/require` en la app y el visor pasan a este resolvedor. Una referencia que no está en ninguno de los dos se dibuja con el marcador de "desconocido" (principio 6 del plan) y se conserva intacta.

El test de contrato del catálogo se extiende con especificaciones aleatorias (fast-check): toda especificación válida compila, construye sin NaN y su envolvente coincide con `size` (±1 mm) con medidas por defecto, mínimas y máximas.

### Biblioteca del navegador

- Puerto `FurnitureLibrary` (`list`, `get`, `save`, `remove`, `subscribe`) con el adaptador `LocalFurnitureLibrary`: store `furniture` en la base IndexedDB de la app (sube la versión de `db.ts`); los binarios de los modelos van al store `assets` ya existente, por hash.
- Con cuentas (futuro): `CloudFurnitureLibrary` sobre `users/{uid}/furniture`, y al iniciar sesión se ofrece subir la biblioteca local. La UI usa solo el puerto.

### Interfaz

- **Catálogo → «Muebles personalizados»:** «Crear mueble» (editor), «Importar modelo 3D» (camino B), la lista de **mi biblioteca** y, aparte, los **de este proyecto** que no están en ella (con «Guardar»). Elegir uno abre la sesión de ubicación de siempre (ADR-0010).
- **Editor (camino A):** diálogo con vista previa 3D orbitable y lista de piezas (agregar caja o cilindro; medidas y posición numéricas; slot de material; duplicar, borrar). Botón «Partir de un mueble del catálogo». Nombre, categoría, montaje y si se puede atravesar.
- **Importar (camino B):** elegir `.glb`/`.gltf`, ver la vista previa, ajustar la medida real (un lado) y el frente; se valida el tamaño y los triángulos.
- **Inspector de un mueble personalizado:** «Guardar en mis muebles» si no está en la biblioteca (o «Guardado ✓») y «Editar copia».

## Consecuencias

- Primera migración real del documento (v1 → v2), con test con fixture v1.
- Las miniaturas de los personalizados se generan con el mismo renderer fuera de pantalla; se guardan en la biblioteca para listarlas sin abrir el visor.
- Los modelos importados son del usuario: se informa que debe tener derecho a usarlos (los enlaces son públicos).
- Rendimiento: los compuestos se fusionan por material como cualquier mueble; los modelos cuentan sus mallas en el presupuesto de draw calls (`perf-budget.spec.ts`).
