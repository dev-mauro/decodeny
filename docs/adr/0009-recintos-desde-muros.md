# ADR-0009: Recintos detectados desde el grafo de muros

- Estado: aceptada
- Fecha: 2026-10-26

## Contexto

I7 agrega dibujar muros sueltos en la planta y espera que los recintos aparezcan solos al cerrar un contorno. Los recintos del documento son ciclos de nodos sobre el **eje** de los muros (ADR-0007), pero el usuario ve **caras**: dos recintos con muros dobles (cada uno con su muro, tocándose cara a cara) se ven cerrados aunque sus ejes no se conecten, y un hueco limitado por ellos no forma un ciclo en el grafo.

## Decisión

- `addWall` une el muro nuevo al grafo: extremos sobre nodos o muros (esquina, unión en T) y nodos en los cruces (X), para que el grafo sea plano.
- `reconcileRooms` busca las caras acotadas mínimas del grafo (recorrido de caras con los vecinos ordenados por ángulo, sin filamentos) y las sincroniza con los recintos: una cara que ya es recinto se deja; las caras dentro de un recinto lo dividen (la mayor conserva id, nombre y terminaciones); al borrar un tabique, la cara resultante hereda los datos del recinto mayor; el resto son recintos nuevos. Solo se aceptan caras que serían un recinto válido (incluido un interior no invertido).
- **Puentes entre muros que se tocan:** si la huella de un nodo toca la de otro muro sin conectarse, se prueba en una copia del nivel un tramo corto del nodo al eje de ese muro. Se agrega al documento **solo si** forma parte de una cara válida nueva. El puente queda dentro del muro macizo (espesor y altura mínimos de los dos), así que no cambia lo que se ve; no se crean puentes que crucen muros ni que corten un vano.

## Consecuencias

- Un contorno que se ve cerrado se reconoce aunque mezcle muros de varios recintos o muros dobles (p. ej. la plantilla 2D2B).
- El documento puede tener tramos cortos de muro "puente"; son muros normales (se pueden seleccionar o borrar), sin un tipo nuevo en el esquema.
- La detección corre al dibujar o borrar muros y con «Detectar recintos»; no corre al abrir un archivo, así que nunca cambia un proyecto por sí sola.
