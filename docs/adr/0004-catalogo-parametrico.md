# ADR-0004: Catálogo de contenido paramétrico basado en registros

- Estado: aceptada (implementada para vanos en I3)
- Fecha: 2026-10-25

## Contexto

El catálogo de muebles, puertas, ventanas, texturas y decoración crecerá continuamente. Los muebles deben ajustarse a medidas arbitrarias del usuario sin deformarse (una mesa más ancha no debe tener patas más gruesas).

## Decisión

- Cada elemento es una **definición** registrada en un `Registry` con: id y versión, nombre localizado, esquema de parámetros (Zod, con default/min/max), slots de material, tipo de montaje, generador puro de piezas y metadatos opcionales (interacciones como `sit`/`lie`, emisores de luz, perfil de corte para vanos).
- Los muebles se **reconstruyen** desde sus parámetros (paramétricos), no se escalan.
- La UI de propiedades se genera desde el esquema de parámetros.
- Un test de contrato recorre todo el registro (construcción con params default/min/max, bounding box coherente).

## Consecuencias

- Agregar contenido = agregar un archivo de definición; sin cambios en el motor ni en la UI.
- El versionado por definición permite migrar parámetros de archivos antiguos.
- Las mallas ya exponen slots de material por cara, y `MeshBuilder` soporta agujeros (vanos).

## Notas de implementación (I3)

- Los parámetros se declaran con descriptores propios (`lengthParam`, `numberParam`, `choiceParam`, `booleanParam`) en lugar de Zod directo: además de validar (`resolveParams` completa y acota), llevan etiqueta localizada, unidad y semántica para generar la UI.
- La referencia guardada en el documento incluye la versión (`door.single@1`); un cambio incompatible de parámetros será `door.single@2` con migración propia.
- El perfil de corte poligonal (arcos, ojos de buey) queda para cuando exista la primera ventana no rectangular; hoy el corte es la envolvente rectangular.
