# ADR-0006: Modos de navegación registrables y física cinemática

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

El producto necesita un modo "persona" (1,70 m, no atraviesa muros) y un modo "vuelo libre" (atraviesa muros), y en el futuro sentarse, acostarse, recorridos guiados, VR y controles táctiles.

## Decisión

- Modos como definiciones en un `Registry` (`edit`, `person`, `ghost`), cada uno con su componente, frameloop y FOV.
- Persona: cápsula con controlador **cinemático** de Rapier (no un cuerpo dinámico): movimiento predecible, deslizamiento por muros, autostep y snap al suelo; gravedad integrada a mano en `stepPerson`.
- Colisionadores derivados del documento (una caja por muro + suelo continuo); con vanos (I3) cada muro se dividirá en tramos.
- Mirada con Pointer Lock; entrada abstraída como `MovementIntent`.
- Rapier se carga bajo demanda (chunk separado).

## Consecuencias

- Sentarse/acostarse serán estados adicionales del controlador (XState cuando haya más de dos estados) usando las _affordances_ de los muebles (ADR-0004).
- El contrato "los muros detienen a la persona" está cubierto por tests de integración con el motor real.
