# ADR-0016: Escaleras: huecos de losa derivados y colisión por rampas

- Estado: aceptada
- Fecha: 2026-10-28

## Contexto

Con varias plantas (I12), una escalera une dos pisos: tiene que verse con peldaños, abrir un hueco en la losa de arriba (en el cielo de su planta y en el piso de la siguiente) y poder subirse caminando en el recorrido. El controlador cinemático de Rapier sube escalones de hasta 20 cm, pero cada peldaño es un salto de cámara, y en una escalera caracol las huellas angostas junto al pilar no le dejan apoyo.

## Decisión

Las escaleras son **items del catálogo** (categoría `stairs`), no una entidad nueva del documento. La definición de item gana contratos opcionales, útiles también para lo que viene (ascensor, «vacío» de doble altura):

- `floorOpening(params)`: polígono local del hueco que abre en la losa de arriba. Los huecos **no se guardan**: se derivan de los items de cada planta (`levelFloorOpenings`), así mover o borrar la escalera mueve o cierra el hueco.
- `colliders(params)`: cajas de colisión propias; una caja inclinada (`pitch`) es una **rampa**. Cada tramo colisiona como una rampa por las narices de los peldaños (así llega justo al borde de la losa o del descanso, sin escalón) y los descansos como cajas planas; las rampas por la línea de paso se marcan `walkway`. Las barandas son cajas verticales por peldaño (las inclinadas tendrían los extremos sesgados y cerrarían el paso al descanso).
- `planOutline` y `planSymbol`: contorno (una L, un círculo) y símbolo (huellas y flecha de subida) en el plano.
- `fillsStorey`: el alto es de piso a piso; al ubicarla toma `storeyRise` y el inspector avisa si no llega a la planta de arriba, con un botón para ajustarla.

Las piezas admiten `pitch` (pasamanos inclinados, `bar`). Los peldaños siguen la regla de Blondel (2 contrahuellas + 1 huella ≈ 63 cm, contrahuella ≤ 18 cm). Cada escalera trae barandas de protección alrededor del hueco en la planta de arriba, salvo por donde se llega.

La **losa** entre plantas es una derivación del visor (`levelSlab`): los recintos y muros de la planta unidos, menos los huecos (con `polygon-clipping`, solo en el chunk 3D). Se usa para el canto de la losa (cierra la fachada entre el cielo de abajo y el piso de arriba, y bordea los huecos) y como piso de colisión de las plantas que no son la más baja. En el recorrido colisionan todas las plantas y el visor informa la planta en la que quedan los pies (`onLevelChange`); la aplicación la activa.

El caracol gira 300° y deja un sector de 60° de losa como descanso de llegada, sobre el piso de la entrada: nunca queda un tramo sobre otro (sin problemas de altura libre). Su rampa va por una línea de paso cercana a la baranda, donde la pendiente es más suave; el recorrido sube pendientes de hasta 50°.

**Subir y bajar en el recorrido.** Solo con las rampas, el controlador frena en cada unión y cada quiebre (en el caracol, a 45°, casi a cada paso), y una guía que llevara a la persona por la línea de paso le quitaría el control. Cada escalera declara su línea de paso (`walkPath`) y su ancho (`walkWidth`); sobre un tramo, la altura de los pies sale del perfil de esa línea (una esfera del tamaño de la persona apoyada en él, promediada al pie), y mientras tanto el controlador ignora las rampas y las losas (un grupo de colisión propio) pero sigue chocando con barandas, pilar y muros. La dirección es siempre la de las teclas y la mirada; solo si se camina casi a lo largo del tramo se endereza suavemente, se aleja de las barandas y, en el caracol, la mirada acompaña su giro.

## Consecuencias

- Un hueco puede quedar fuera de los recintos (una escalera mal ubicada): la resta lo recorta y no rompe la losa.
- Una escalera que sobresale de la casa se ve afuera; el inspector ya avisa si atraviesa un muro.
- El ascensor y el «vacío» usan los mismos contratos (`floorOpening`, `colliders`). El ascensor suma la afordancia `travel` y `openingSpan` (cuántas losas atraviesa); su plataforma no es parte del documento: se mueve en el recorrido como las puertas.
