# ADR-0008: Materiales con patrones procedurales a escala física

- Estado: aceptada
- Fecha: 2026-10-26

## Contexto

I5 pide pisos y muros con textura (madera, cerámica, alfombra…), color ajustable, escala real ("un porcelanato 60 × 60 mide 60 × 60") y agregar materiales sin tocar el motor. El plan sugería texturas fotográficas CC0 + pipeline KTX2, lo que implica descargar y procesar assets, peso de descarga y gestión de licencias.

## Decisión

- Un material de catálogo **describe un patrón** (`planks`, `herringbone`, `tiles`, `brick`, `stripes`, `motif`, `linen`, `concrete`, `carpet`, `plain`) y sus parámetros (tamaño de baldosa, ancho de tabla, fragüe…); no contiene imágenes.
- El visor tiene un registro de **pintores** que generan la imagen del patrón en JS puro (sin canvas: testeable en Node) cubriendo un tamaño físico conocido; la textura se repite con `repeat = 1000 / tamaño_mm` sobre UV en metros.
- Dos etapas: el **campo** (sombra por píxel y capa secundaria de fragüe/franja) depende de la forma y se cachea; el **coloreado** aplica color base y secundario en < 16 ms. Cambiar un color es instantáneo.
- Las instancias de material del documento (`materials[]`) se comparten entre superficies (cuentagotas) y se pueden independizar; las huérfanas sin nombre se eliminan.
- Terminaciones por defecto (`DEFAULT_FINISHES`) para superficies sin material, de modo que la muestra y la vista 3D coinciden.
- Iluminación: mapa de entorno procedural (`RoomEnvironment` + PMREM), sin descargar HDRI.

## Consecuencias

- Agregar un material = una definición en `packages/catalog/src/materials`; un patrón nuevo = un pintor registrado en el visor.
- El realismo es "de maqueta" (sin mapas de normales ni fotografías). El pipeline KTX2 con texturas fotográficas queda en el backlog y encajaría como otro tipo de patrón (`image`) sin cambiar el documento.
