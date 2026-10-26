# ADR-0010: Ubicar elementos nuevos con el puntero

- Estado: aceptada
- Fecha: 2026-10-26

## Contexto

Al elegir un mueble del catálogo se agregaba directamente en un lugar sugerido. El usuario debe decidir dónde va: el mueble tiene que seguir al puntero, como al arrastrarlo, hasta que haga clic. Lo mismo servirá después para puertas, ventanas o cualquier contenido nuevo.

## Decisión

- **Contrato del visor (`ViewerPlacement`)**: una sesión de ubicación con la altura del plano donde se proyecta el puntero y un callback de eventos `move` / `end` con el punto en planta y si se ajusta (Alt). Mientras está activa, la vista no selecciona ni resalta. La vista 3D y la planta implementan el mismo contrato. El visor no sabe qué se ubica (ADR-0003).
- **Vista previa en el documento**: la aplicación abre una transacción (`preview`) que repite `addItem` con un **id fijo** (nuevo argumento opcional del comando), con el mismo ajuste por montaje que el arrastre (`itemPlacementAt`). Clic o Enter confirman (`commitPreview`, un solo paso de deshacer), Esc cancela, R gira.
- La sesión vive en el estado de interfaz; si cualquier otra acción cierra la transacción (deshacer, otro comando), la sesión termina sola.
- El elemento aparece primero en el lugar sugerido del recinto activo, de modo que Enter lo deja ahí (uso con teclado).

## Consecuencias

- Agregar otro tipo de contenido con el puntero = un comando que acepte id fijo + una función de ajuste; el visor no cambia.
- La vista previa usa los mismos comandos y validaciones que el resultado final: lo que se ve es lo que queda.
