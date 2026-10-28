# ADR-0015: El lápiz dibuja la cara interior de los muros

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

Con el lápiz («Dibujar muros»), cada tramo se ubicaba por el **eje** del muro. Al dibujar 2 m, giro, 1 m, giro, 2 m, giro, 1 m, el espacio quedaba de (2 − espesor) × (1 − espesor): medio espesor de cada muro se comía el interior. Quien dibuja mide el espacio libre entre muro y muro (igual que al crear un espacio por medidas, que ya usa medidas interiores).

## Decisión

Lo dibujado es la **cara interior**. Mientras la cadena está abierta no se sabe de qué lado queda el interior; cuando un tramo **cierra un espacio**, el mismo comando (`addWall` con `chain`) ajusta ese espacio (`fitRoomToDrawnFaces`):

- Los muros de la cadena que solo bordean ese espacio se corren hacia afuera medio espesor y sus esquinas se recalculan (intersección de las nuevas líneas de eje). El interior queda exactamente como se dibujó, con cualquier forma y ángulo.
- Si la cadena empezó sobre un muro existente (un espacio adosado), las medidas cuentan desde la **cara** de ese muro: lo dibujado se aleja medio espesor de él. Las uniones en T con muros existentes se deslizan sobre ellos; las esquinas que ya existían y los espacios vecinos no se mueven.
- Un tabique que divide un espacio (bordea dos) queda donde se dibujó.
- Si el ajuste dejara una geometría inválida (un espacio más angosto que sus muros), se descarta y el muro se agrega como antes.

Es un solo comando: un paso de deshacer y la misma operación para todos en una sesión colaborativa. Las demás herramientas (crear por medidas, mover esquinas, editar coordenadas) no cambian.

## Consecuencias

- Al cerrar el contorno, los muros "saltan" medio espesor hacia afuera (lo dibujado pasa a ser su cara interior). Es el momento en que se sabe dónde está el interior.
- Las guías y ajustes de los tramos siguientes usan las posiciones ya ajustadas (los ejes).
