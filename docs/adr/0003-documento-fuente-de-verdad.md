# ADR-0003: El documento es la única fuente de verdad; cambios vía comandos

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

Necesitamos export/import, deshacer/rehacer, autoguardado y, a futuro, colaboración y edición asistida. Si la escena 3D o la UI guardan estado propio del modelo, esas capacidades se vuelven frágiles.

## Decisión

- Un documento serializable (`Project`, esquema Zod versionado) contiene todo lo que el usuario define.
- La escena 3D es una **proyección de solo lectura** del documento.
- Toda modificación es un **comando** puro (`defineCommand`) ejecutado con Immer `produceWithPatches`; el historial guarda patches e inversos.
- La carga pasa por `migrateDocument → ProjectSchema → checkIntegrity`. Cada cambio incompatible sube `schemaVersion` y agrega una migración.

## Consecuencias

- Deshacer/rehacer de cualquier operación sin código adicional.
- Los comandos son una API natural para tests, scripts, futuros asistentes (lenguaje natural) y colaboración (patches → CRDT).
- Las referencias a contenido de catálogo usan `def: "categoria.nombre@version"` + `params` genéricos: agregar contenido no cambia el esquema.
