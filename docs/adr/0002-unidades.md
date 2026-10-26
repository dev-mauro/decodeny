# ADR-0002: Milímetros enteros en el documento

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

Las medidas de arquitectura se expresan habitualmente en milímetros; los flotantes en metros acumulan errores (0,1 + 0,2) y hacen frágiles las comparaciones y los tests de ida y vuelta. El producto es solo métrico.

## Decisión

- El documento guarda longitudes como **enteros en milímetros** (validado por el esquema).
- La UI muestra metros con coma decimal (`4,20 m`) y acepta `m`, `cm` y `mm`; un número sin unidad son metros.
- El visor convierte a metros (unidad de Three.js) en un único punto (`planToWorld`).
- Sistema de coordenadas: planta `x` este, `y` norte; mundo `Y` arriba y norte = `−Z`.

## Consecuencias

- Igualdades exactas en tests y en export/import.
- Geometrías derivadas (offsets, ingletes) son flotantes, pero solo los nodos se persisten (redondeados).
