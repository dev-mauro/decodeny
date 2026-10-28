# ADR-0014: Salas de colaboración con código corto (señalización por Firestore)

- Estado: propuesta
- Fecha: 2026-10-28

## Contexto

La colaboración (ADR-0011) conecta los navegadores por WebRTC, pero la señalización es manual: el anfitrión genera un enlace por invitado, el invitado devuelve un código de respuesta y el anfitrión lo pega. Son dos copias y pegadas por persona. Ahora hay Firestore (ADR-0012): se puede usar como **buzón de señalización** para que unirse sea escribir un código corto.

## Decisión

### Flujo (iniciado por el invitado: un solo ida y vuelta)

1. **Abrir sala (anfitrión):** crea `rooms/{codigo}` con un código corto y fácil de dictar (6 letras sin ambiguas, p. ej. `K7Q-4MD`; ~880 millones de combinaciones). Se crea solo si no existe (si choca, otro código). Escucha la subcolección `requests` en tiempo real.
2. **Unirse (invitado):** escribe el código en Colaborar → Unirse a una sesión (o abre `?sala=K7Q4MD`). La app lee la sala, crea su `RTCPeerConnection` y escribe `rooms/{codigo}/requests/{id}` con su nombre y su **oferta** (SDP completo, ICE no incremental, como hoy). Escucha ese documento.
3. **Anfitrión:** al llegar la solicitud, acepta la oferta, escribe la **respuesta** en el mismo documento y espera la conexión.
4. **Invitado:** aplica la respuesta y el canal se abre (los dos canales negociados de siempre). Conectados, se borra la solicitud.

Se invierte quién ofrece respecto de hoy (`PeerLink` ya tiene `createOffer`, `acceptOffer` y `acceptAnswer`, simétricos). Todo lo demás (estrella, `HostSync`/`GuestSync`, presencia, cuerpos) no cambia.

### Datos y reglas

```
rooms/{code}                     hostUid, hostName, createdAt, expiresAt, open
rooms/{code}/requests/{id}       guestUid, name, offer, answer?, createdAt
```

- Ambos lados usan la identidad anónima de ADR-0012 (el invitado se identifica al unirse, sin pedirle nada).
- Reglas: la sala se lee con el código (con identidad) y la crea/cierra solo su anfitrión; una solicitud la crea su invitado (`guestUid == auth.uid`, oferta ≤ 20 kB), **la lee solo el invitado o el anfitrión** (el SDP lleva direcciones IP) y solo el anfitrión escribe la respuesta. Nadie lista salas.
- Vencimiento: `expiresAt` (p. ej. 12 h); la limpieza diaria (`cleanup.yml`) borra salas vencidas con sus solicitudes, y el anfitrión borra la suya al terminar.

### Código

- Puerto `Signaling` en `features/collab` (`openRoom`, `onRequest`, `answer`, `join`, `close`) con dos adaptadores: el **manual** actual (queda como alternativa sin nube o si la red bloquea Firestore) y el de **Firestore**, en `features/cloud/firebase/` (único lugar que importa Firebase).
- Las escuchas en tiempo real necesitan `firebase/firestore` completo (no _lite_): se carga bajo demanda solo al colaborar, en su propio chunk, con presupuesto en `pnpm size`.

### Interfaz

- Anfitrión: «Crear sala» muestra el código grande y un botón para copiar el enlace `?sala=…`; la lista de participantes se completa sola.
- Invitado: «Unirse» con un campo para el código (mayúsculas, tolera espacios y guiones).
- «Conectar a mano» (lo de hoy) queda en un desplegable para casos sin nube.

## Consecuencias

- Unirse pasa de dos copias y pegadas a escribir 6 letras.
- Sigue sin TURN: redes muy restrictivas pueden no conectar (igual que hoy); el error se informa igual.
- Costo: unas pocas escrituras y lecturas por invitado; las escuchas solo mientras la sala está abierta.
- Tests: reglas en el emulador; señalización con un adaptador en memoria; E2E de dos contextos uniéndose por código (con emuladores).
