# ADR-0011: Colaboración en tiempo real por WebRTC (sin servidor)

- Estado: aceptada (implementación en la rama `feat/colaboracion`)
- Fecha: 2026-10-27

## Contexto

Se pide que varias personas editen el mismo proyecto y lo recorran juntas: una puede estar en el recorrido mientras otra modifica el espacio, o todas en el mismo modo. En 3D cada participante tiene un cuerpo visible; en el plano, no. La aplicación es estática (GitHub Pages, sin backend), así que la conexión debe ser **WebRTC con servidores STUN públicos y señalización manual**.

## Investigación

**WebRTC sin servidor de señalización.** Dos navegadores necesitan intercambiar una oferta y una respuesta SDP (con sus candidatos ICE). Sin servidor, ese intercambio lo hacen las personas: se copia un texto y se pega en el otro lado. Para que alcance un solo ida y vuelta se usa **ICE no incremental**: se espera a que termine la recolección de candidatos (`icegatheringstatechange` → `complete`) y se comparte el SDP completo. Comprimido (`CompressionStream('deflate-raw')`) y en base64url ocupa ~0,6–1,5 kB: cabe en un enlace o en un mensaje de WhatsApp.

**STUN y NAT.** STUN (p. ej. `stun.l.google.com:19302`, `stun.cloudflare.com:3478`) permite descubrir la dirección pública y atravesar la mayoría de los NAT domésticos y móviles. Sin un servidor TURN, las redes con NAT simétrico o firewalls corporativos estrictos pueden no conectar (en la literatura, del orden de 10–20 % de los pares). En la misma red local siempre conecta (candidatos de host). Se informa con un mensaje claro y un tiempo de espera; agregar un TURN propio queda como opción futura (solo cambia la lista de `iceServers`).

**Topología.** Con N participantes, la malla completa exigiría N(N−1)/2 intercambios manuales. Se usa **estrella**: quien crea la sesión es el **anfitrión** y cada invitado se conecta solo con él (un enlace de invitación y una respuesta por invitado). El anfitrión retransmite. Si el anfitrión se va, la sesión termina y cada uno conserva su copia.

**Canales.** Dos `RTCDataChannel` por par: `doc` (confiable y ordenado) para el documento, y `presence` (no ordenado, `maxRetransmits: 0`) para posiciones de cámara a ~12 Hz. El tráfico va cifrado (DTLS). Los mensajes grandes (proyecto inicial, imágenes) se fragmentan en trozos de 16 kB para no depender de los límites de SCTP de cada navegador.

**Sincronización del documento.** El dominio ya modela cada cambio como un **comando determinista** (función del documento, de los argumentos y de los ids generados) con parches de Immer. Se aprovecha:

- El anfitrión es la **autoridad de orden**: aplica cada operación y la difunde como `{seq, autor, parches}`.
- Los invitados son **optimistas**: ejecutan su comando al instante (sin esperar la red), guardan `{tipo, args, ids}` como pendiente y lo envían. Al recibir operaciones del anfitrión reconstruyen: `confirmado ← aplicar parches`; `visible ← confirmado + reejecutar pendientes` (mismos ids, así el resultado es idéntico si nada cambió en el medio). Su propia operación vuelve como confirmación y sale de pendientes. Es reconciliación cliente/servidor clásica y converge siempre al orden del anfitrión.
- Los arrastres se previsualizan solo en local y se envían al soltar (los demás ven el resultado final).
- **Deshacer/rehacer** durante una sesión es **de la sesión**: lo ejecuta el anfitrión sobre su historial y se difunde. Es simple y predecible; deshacer "solo lo mío" con ediciones intercaladas queda fuera de alcance.
- Las **imágenes** (cuadros con foto) viajan como blobs: el anfitrión envía las del proyecto al unirse alguien, y las nuevas se reenvían a todos.
- Un registro de comandos del dominio (`tipo → comando`) permite ejecutar operaciones recibidas.

**Presencia y cuerpos.** Cada participante difunde su pose de cámara (posición y orientación), modo de navegación, vista (3D/plano), nombre y color. En 3D, los demás se dibujan como un cuerpo simple (torso, cabeza, nariz hacia donde miran) con su nombre: de pie en el piso en el recorrido, flotando en edición y vuelo. En el plano no se dibujan. Se interpola entre muestras para que el movimiento sea fluido.

## Decisión

Viable con las limitaciones descritas. Se implementa en `feat/colaboracion` por capas:

1. **Dominio:** registro de comandos y fábrica de ids reproducible (`replayIds`).
2. **Transporte** (`apps/web/src/features/collab/transport`): códec del SDP (comprimir/codificar), conexión anfitrión/invitado con STUN e ICE no incremental, canales y fragmentación.
3. **Sincronización:** el store del documento emite cada operación local (comando, argumentos, ids, parches) y acepta proyectos que llegan de la sesión; anfitrión (ordena y difunde) e invitado (pendientes y reconciliación) como módulos puros con tests.
4. **Presencia y cuerpos:** el visor informa la pose de la cámara y dibuja los cuerpos de los demás (`peers`).
5. **Interfaz:** botón «Colaborar» → crear sesión e invitar (enlace con la oferta + pegar la respuesta) o unirse (abrir el enlace → copiar la respuesta); lista de participantes con su color; avisos de conexión y desconexión.

## Consecuencias

- No hace falta ningún servidor propio; GitHub Pages sigue siendo suficiente.
- La invitación requiere dos pasos manuales por invitado (enviar el enlace, devolver la respuesta).
- Puede no conectar en redes muy restrictivas sin TURN; se explica al usuario.
- El anfitrión debe mantener la página abierta; si se va, la sesión termina.
- Deshacer es compartido durante la sesión.
