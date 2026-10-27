# ADR-0012: Maquetas locales y compartidas (Firestore), enlaces, forks y limpieza

- Estado: aceptada (implementada en I10)
- Fecha: 2026-10-27

## Contexto

Antes, el proyecto vivía solo en el navegador (un único autoguardado en IndexedDB) y se compartía exportando un archivo. Se pide:

1. Guardar las casas en **Firestore**, sin login ni cuenta, con un **id único** que permita abrirlas y compartir el enlace.
2. Una **GitHub Action** que borre las que no tuvieron actividad (visitas) en el último mes.
3. Al abrir el enlace de otra persona, editar crea un **fork**: el trabajo del primero no se altera; el fork puede editarse entre varios (colaboración, ADR-0011).
4. Diseñar pensando en **cuentas de usuario futuras** (casas y muebles propios) sin implementarlas.

Decisiones del usuario (2026-10-27):

- Las casas se llaman **Maquetas**. Hay una **colección local** de maquetas en el navegador (IndexedDB); **solo al pulsar «Compartir» se sube** a la nube, y desde ahí la maqueta local y la compartida se sincronizan.
- **La sesión es la del autor:** que una maqueta esté en la colección local de este navegador (con su vínculo a la nube) dice que este navegador es su autor; los demás hacen fork al editar. La detección debe ser a prueba de fallos.
- Las reglas de seguridad se despliegan **por workflow**.

Restricciones vigentes: sitio estático en GitHub Pages (sin servidor propio ni otro hosting), carga inicial < 400 kB gzip, local-first, documento portable (ADR-0003).

## Investigación

**Límites de Firestore.** Documento ≤ **1 MiB** y ≤ **40 000 entradas de índice**; no admite **arreglos anidados**. Un proyecto grande guardado como mapa choca con los tres → el proyecto se guarda **serializado y comprimido** (deflate-raw) en un campo `Bytes` **excluido de los índices** (`firestore.indexes.json`). Es opaco para Firestore y desacopla el esquema del proyecto (con sus migraciones) del almacenamiento.

**Archivos.** Cloud Storage for Firebase exige el plan Blaze (con tarjeta), incluso para el bucket por defecto. Para no depender de él, las imágenes (y en el futuro los modelos) se guardan **en Firestore, en trozos** de ≤ 900 kB. Si el proyecto pasa a Blaze, se cambia el adaptador de assets sin tocar el resto.

**Cuotas gratuitas (Spark):** 1 GiB almacenado; 50 000 lecturas, 20 000 escrituras y 20 000 borrados por día. Lo local manda y la nube recibe los cambios agrupados (4 s después del último), así una hora de edición son pocas decenas de escrituras.

**Identidad sin cuenta.** Las reglas solo conocen `request.auth`. **Firebase Anonymous Auth** da un `uid` estable por navegador sin pedir nada (invisible: "sin login, sin cuenta") y es el **puente a las cuentas**: `linkWithCredential` convierte el usuario anónimo en permanente (Google, correo) **con el mismo `uid`**, así sus maquetas siguen siendo suyas sin migrar datos. Descartados: un token secreto en el documento (quien lo lee lo obtiene) o en una colección privada (sin camino a cuentas). Solo se crea una identidad al **compartir**: mirar un enlace no la necesita.

**SDK.** `firebase/firestore/lite` (REST: sin escuchas ni caché, que no hacen falta) + `firebase/auth` sin resolutor de popups. Se cargan **bajo demanda** en el chunk `cloud` (~54 kB gzip), fuera de la carga inicial (lo vigila `pnpm size`).

**Limpieza.** TTL nativo borra documentos pero **no sus subcolecciones**. Los workflows `schedule` de GitHub **se desactivan tras 60 días sin actividad** en un repositorio público (se documenta en el propio workflow).

## Decisión

### Modelo local (IndexedDB, store `maquetas`)

```ts
MaquetaRecord {
  id, name, project /* JSON */, createdAt, updatedAt,
  forkOf: string | null,                 // maqueta compartida de la que es copia
  cloud: { houseId, ownerUid, rev, dirty } | null   // vínculo con la compartida
}
```

La sesión (`MaquetaSession`, lógica pura con dependencias inyectadas) sabe de dónde viene el documento abierto (`Binding`):

| Origen    | Qué es                               | Qué hace un cambio                                                                |
| --------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `maqueta` | Guardada en este navegador           | Se guarda local (600 ms); si está compartida, se sube (4 s)                       |
| `draft`   | Proyecto nuevo sin cambios           | El primero la vuelve maqueta                                                      |
| `visit`   | Compartida de otra persona, tal cual | El primero crea una **maqueta propia** con `forkOf` (fork, local)                 |
| `guest`   | Invitado de una sesión colaborativa  | Nada (el documento es del anfitrión); al terminar, lo recibido queda como maqueta |

El autoguardado único anterior se migra a una maqueta al iniciar (una vez).

### Modelo en la nube

```
houses/{houseId}                 id automático de 20 caracteres (~119 bits, no adivinable)
  v, ownerUid, forkOf, name, project: Bytes (deflate), projectSchemaVersion,
  assets: string[], rev, createdAt, updatedAt, lastVisitAt
assets/{assetId}                 ficha inmutable: ownerUid, mime, size, sha256, chunkCount, createdAt
assets/{assetId}/chunks/{n}      data: Bytes (≤ 900 kB)
users/{uid}                      (futuro) perfil de la cuenta
users/{uid}/furniture/{id}       (futuro) biblioteca de muebles (ADR-0013)
```

- El **documento del proyecto no guarda nada de la nube**: sigue portable. El vínculo vive en el registro local.
- Los assets se identifican por su id (inmutable: un id nunca cambia de contenido), así un fork no copia imágenes. Se suben los trozos y al final la ficha; al descargar se verifica el `sha256`.
- El enlace es `…/decodeny/?maqueta=<houseId>`.

### Detección de fork a prueba de fallos

La colección local es la **pista** para la interfaz; la **autoridad** es la nube:

1. Abrir un enlace: si hay una maqueta local vinculada a esa compartida **con el mismo dueño**, se abre esa (y si la nube va adelante sin cambios locales pendientes, se trae lo último). Si no, es una **visita**.
2. Subir cambios: transacción que exige que la revisión de la nube sea la **de esta pestaña** (guardada en memoria por pestaña, no en el registro compartido), y las reglas exigen dueño y `rev + 1`.
3. Si algo falla, **nunca se pisa ni se pierde trabajo**:
   - `conflict` (otra pestaña subió antes): la maqueta local vuelve a la versión de la nube y los cambios de esta pestaña quedan en una **copia nueva**, que queda abierta.
   - `forbidden` (la nube no reconoce al dueño: identidad perdida, lista copiada de otro navegador…): la maqueta queda como **copia** (`forkOf`), sin vínculo.
   - `not-found` (venció): queda solo local.
   - Sin conexión: queda marcada `dirty` y se reintenta (5 s, 15 s, 60 s y al volver la red).

Está cubierto por tests de la sesión con una nube en memoria con las mismas reglas (`MemoryCloud`) y por E2E contra los emuladores.

### Reglas de seguridad (`firebase/firestore.rules`)

- `houses`: lectura por id para cualquiera; **listado solo de las propias**; creación con `ownerUid == auth.uid` y `rev == 1`; edición solo del dueño, sin cambiar dueño ni origen y con `rev + 1`; una **visita sin cuenta** solo puede tocar `lastVisitAt` (como mucho una por hora); nadie borra (solo la limpieza).
- `assets`: lectura para cualquiera; trozos y ficha solo con identidad propia, con tamaños acotados; inmutables una vez creada la ficha.
- Quién edita está en una función (`canEdit`): con miembros invitados, solo cambia ahí.
- Se prueban contra el emulador (`firebase/test/rules.test.mjs`).

### Limpieza (GitHub Action `cleanup.yml`)

Diaria y manual (con simulación). `scripts/cloud/cleanup.mjs` (Admin SDK, secreto `FIREBASE_SERVICE_ACCOUNT`):

1. Borra `houses` con `lastVisitAt` de hace más de 30 días (las visitas y los guardados del dueño lo actualizan).
2. Marca y barre: borra los `assets` (con sus trozos) que ninguna maqueta usa y tienen más de un día, incluidas las subidas a medias.

Probado contra el emulador (`firebase/test/cleanup.test.mjs`).

### Despliegue de reglas (workflow `firebase-rules.yml`)

En `main`, cuando cambia `firebase/**` (o a mano): prueba las reglas en el emulador y despliega reglas e índices con otra cuenta de servicio (`FIREBASE_DEPLOY_SA`, roles de administrador de reglas y de índices) en el proyecto `vars.FIREBASE_PROJECT_ID`. Sin secreto, avisa y no despliega.

### Código (preparado para cuentas)

```
apps/web/src/features/cloud/
  ports.ts             Identity, HouseRepository, AssetRepository, CloudError (sin Firebase)
  memory-backend.ts    nube en memoria con las mismas reglas (tests)
  cloud-config.ts      VITE_FIREBASE_* (sin ellas, la nube queda desactivada)
  firebase/            adaptador: único lugar que importa firebase/* (regla de dependency-cruiser)
apps/web/src/features/maquetas/
  maqueta-repository.ts  IndexedDB + memoria
  maqueta-session.ts     orígenes, guardado, compartir, sincronizar, forks y conflictos
  maquetas.ts            instancia de la app, enlace ?maqueta=, arranque
  MaquetasDialog.tsx, ShareDialog.tsx (+ VisitBadge, ShareButton)
firebase/              firebase.json (emuladores), firestore.rules, firestore.indexes.json, test/
scripts/cloud/         cleanup.mjs, with-emulators.mjs
```

- `Identity` devuelve `{ uid, kind: 'anonymous' | 'account' }`: las cuentas son otra implementación (o enlazar la credencial en la misma) y un botón «Iniciar sesión».
- «Mis maquetas» es hoy la colección local; con cuentas, se suma la consulta `houses where ownerUid == uid` (las reglas ya la permiten) y la fusión de lo local al iniciar sesión.

## Consecuencias

- Compartir es un enlace; el archivo `.decodeny.json/.zip` se mantiene para respaldo e intercambio.
- **Privacidad:** cualquiera con el enlace puede ver la maqueta (se avisa al compartir).
- El mismo autor en **otro navegador o dispositivo** tiene otra identidad: allí hace fork. Las cuentas lo resuelven.
- Las compartidas sin visitas por 30 días desaparecen de la nube (la copia local queda).
- Operación: proyecto de Firebase del dueño del repo, dos cuentas de servicio (limpieza y despliegue) y variables web en GitHub (ver `docs/nube-firebase.md`). Los emuladores necesitan Java 21+.
