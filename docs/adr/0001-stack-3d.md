# ADR-0001: Three.js + React Three Fiber como motor 3D

- Estado: aceptada
- Fecha: 2026-10-25

## Contexto

Necesitamos renderizar espacios interiores en el navegador, con una UI rica (paneles, formularios) y un catálogo de contenido que crecerá. Alternativas: Three.js puro, React Three Fiber (R3F), Babylon.js.

## Decisión

Three.js vía **React Three Fiber** + **drei**, con física **Rapier** (`@react-three/rapier`) a partir de I2.

## Consecuencias

- La escena se declara como componentes React derivados del documento: el mismo modelo mental que la UI.
- Ecosistema amplio (drei: controles de cámara, grilla, etiquetas HTML, cursores).
- La geometría se genera en _builders_ puros (`MeshData`) independientes de Three.js, lo que permite testearla sin WebGL y cambiar de motor si fuese necesario.
- Babylon.js traería colisiones y controladores integrados, pero con menor integración con React; Rapier cubre esa brecha.
