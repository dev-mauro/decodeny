# ADR-0007: Muros compartidos por normalización de la topología

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

Los recintos se crean por medidas interiores y cada uno generaba sus propios muros. Dos recintos adosados quedaban con un tabique doble (dos espesores), lo que es irreal, falsea superficies y complica los vanos (una puerta entre recintos atravesaría dos muros).

## Decisión

- El nivel es un **grafo**: nodos (ejes) + muros (pares de nodos) + recintos (ciclos de nodos). Dos recintos adosados **comparten** el muro cuyo eje coincide.
- Invariante restablecida por `normalizeTopology` tras cada comando que crea recintos o mueve nodos: fusiona nodos coincidentes (tolerancia 2 mm), divide muros en uniones en T, fusiona muros duplicados (gana el existente: espesor, altura, nombre y terminaciones se conservan) y vuelve a unir tramos colineales equivalentes que ya no hacen falta.
- **Lado** de un recinto = tramos consecutivos colineales. «Lado n» no cambia cuando un vecino divide un muro; los tramos se nombran «Lado n.k». El contorno interior se calcula por lados (los nodos en T no generan vértices).
- Mover un recinto primero lo **separa** (`detachRoom`: duplica nodos/muros compartidos; los vanos quedan con el vecino) y luego normaliza: si queda adosado, vuelve a compartir.
- Empujar un lado (`setRoomSideLength`) mueve toda la línea de muro conectada y colineal: los vecinos que comparten el tabique o la fachada se ajustan y siguen siendo rectángulos.
- Arrastrar en la vista se ajusta con `snapRoomTranslation` (ejes coincidentes y esquinas alineadas, 25 cm; grilla de 1 cm si no hay vecinos) y se previsualiza como **transacción** del store: un solo paso de deshacer al soltar.

## Consecuencias

- Los ids de muros pueden cambiar al dividir/fusionar; la UI tolera que la selección desaparezca.
- La selección de un muro guarda la **cara** clicada para saber desde qué recinto se mira (cotas, «Lado n», y en I5 la terminación de esa cara).
- Cruces de muros sin nodo (X) y detección automática de recintos desde muros sueltos quedan para I7.
