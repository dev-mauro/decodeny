# ADR-0012: Casas en la nube (Firestore), enlaces, forks y limpieza

- Estado: propuesta (pendiente de las decisiones abiertas del final)
- Fecha: 2026-10-27

## Contexto

Hoy el proyecto vive solo en el navegador (IndexedDB) y se comparte exportando un archivo. Se pide:

1. Guardar cada casa en **Firestore**, sin login ni cuenta, con un **id único** que permita abrirla y compartir el enlace.
2. Una **GitHub Action** que borre las casas sin actividad (visitas) en el último mes.
3. Al abrir el enlace de una casa cuya sesión terminó, editar crea un **fork**: el trabajo del primero no se altera; el fork puede editarse entre varios (colaboración, ADR-0011).
4. Diseñar pensando en **cuentas de usuario futuras** (casas y muebles propios) sin implementarlas.

Restricciones vigentes: sitio estático en GitHub Pages (sin servidor propio ni otro hosting), carga inicial < 400 kB gzip, local-first, documento portable (ADR-0003).

## Investigación

**Límites de Firestore que condicionan el diseño.**

- Documento ≤ **1 MiB** y ≤ **40 000 entradas de índice**; no admite **arreglos anidados**. Un proyecto grande, guardado como mapa, puede chocar con los tres. → El proyecto se guarda **serializado y comprimido** (deflate-raw, el mismo códec de las invitaciones) en un campo `Bytes` **excluido de los índices**. Es opaco para Firestore, cabe holgado (un JSON de 1 MB comprimido pesa ~100 kB) y desacopla el esquema del proyecto (con sus migraciones) del almacenamiento.
- **Cloud Storage for Firebase exige el plan Blaze** (con tarjeta) desde 2024–2026, incluso para el bucket por defecto. Para no depender de él, las imágenes y modelos se guardan **en Firestore, en trozos** de ≤ 900 kB (`Bytes`). Si el proyecto pasa a Blaze, se cambia el adaptador de assets sin tocar el resto.
- Cuotas gratuitas (Spark): 1 GiB almacenado, 50 000 lecturas, 20 000 escrituras y 20 000 borrados por día. Con guardado agrupado (5 s de inactividad, máximo uno cada 30 s) una hora de edición son ~100–300 escrituras: alcanza para una beta con decenas de horas de edición diaria. Las imágenes se reducen antes de subir (lado mayor ≤ 2048 px, WebP).
- **TTL nativo** de Firestore borra documentos vencidos (en ~24 h) pero **no sus subcolecciones**; no reemplaza la limpieza pedida, aunque puede servir de red de seguridad.

**Identidad sin cuenta.** Sin login hay que distinguir a quien creó la casa (puede seguir editándola) de un visitante (al editar, hace un fork). Las reglas de seguridad de Firestore solo conocen `request.auth`. **Firebase Anonymous Auth** da un `uid` estable por navegador sin pedir nada al usuario: es invisible ("sin login, sin cuenta") y es **exactamente el puente a las cuentas futuras**: `linkWithCredential` convierte el usuario anónimo en uno permanente (Google, correo) **conservando el mismo `uid`**, así todas sus casas siguen siendo suyas sin migrar datos. Alternativas descartadas: un token secreto en el documento (cualquiera que lo lea lo obtiene) o uno en una colección privada (reglas con `get()` extra por escritura, sin camino a cuentas).

**SDK.** `firebase/firestore/lite` (REST, sin escuchas en tiempo real ni caché offline: no los necesitamos, la colaboración va por WebRTC y lo local por IndexedDB) + `firebase/auth`. Se cargan **bajo demanda** en un chunk `cloud`, fuera de la carga inicial; el presupuesto por chunk de CI lo vigila.

**Limpieza programada.** Los workflows `schedule` de GitHub corren con un retraso variable y **se desactivan solos tras 60 días sin actividad en un repositorio público**. Se documenta y el workflow también se puede lanzar a mano.

## Decisión

### Modelo de datos

```
houses/{houseId}                      id aleatorio de 20 caracteres (~119 bits: no adivinable)
  v: 1                                versión del contenedor (no del proyecto)
  ownerUid: string                    uid anónimo hoy; uid de la cuenta mañana (mismo valor)
  forkOf: string | null               casa de origen (linaje; puede ya no existir)
  name: string                        para listados ("Mis casas")
  project: Bytes                      proyecto serializado + deflate (sin índice)
  projectSchemaVersion: number
  assets: string[]                    hashes que referencia (para la limpieza)
  rev: number                         concurrencia optimista (dos pestañas del dueño)
  createdAt, updatedAt, lastVisitAt: Timestamp
assets/{sha256}                       contenido direccionado: compartido entre casas y forks
  mime, size, chunkCount, createdAt
assets/{sha256}/chunks/{i}            data: Bytes (≤ 900 kB)
users/{uid}                           (futuro) perfil de la cuenta
users/{uid}/furniture/{customId}      (futuro) biblioteca de muebles en la nube (ADR-0013)
```

- El **documento del proyecto no guarda nada de la nube** (ni `houseId` ni `ownerUid`): sigue siendo portable y exportable igual que hoy. La asociación "este proyecto local ↔ esta casa" se guarda en IndexedDB junto al autoguardado.
- Los assets están **direccionados por contenido**: un fork no copia imágenes ni modelos, y subir la misma imagen dos veces no ocupa el doble. Al descargar se verifica el hash (si no coincide, se ignora el asset).

### Reglas de seguridad (resumen)

```
houses/{id}
  read:   cualquiera (quien tiene el enlace)
  create: auth != null && ownerUid == auth.uid && project.size() < 900 kB && timestamps == request.time
  update: dueño (no puede cambiar ownerUid ni forkOf; rev == rev anterior + 1)
          || cualquiera con auth que solo toque lastVisitAt = request.time   ← registrar visita
  delete: nadie (solo la limpieza, con la cuenta de servicio)
assets/{hash}, chunks
  read:   cualquiera
  create: auth != null, tamaños acotados; update/delete: nadie
```

Las reglas usan funciones (`isOwner()`), así pasar a `isMember(role)` con miembros invitados es local a las reglas. Se versionan en `firebase/firestore.rules` y se prueban con el emulador (`@firebase/rules-unit-testing`). App Check (reCAPTCHA) queda como mitigación de abuso si aparece.

### Flujo

- **Crear:** un proyecto nuevo se sube al primer cambio real (no al abrir la app vacía) o al pulsar «Compartir». El enlace es `…/decodeny/?casa=<id>`; la barra superior muestra el estado (guardando, guardado, sin conexión) y «Copiar enlace». Sigue habiendo autoguardado local: **lo local manda** y la nube se sincroniza (sin conexión se reintenta al volver).
- **Abrir un enlace:** se descarga, se migra (`loadProject`) y se muestra. Si soy el dueño, edito el original. Si no, la registro como visita (solo si `lastVisitAt` tiene más de 24 h, para no gastar escrituras) y la veo normalmente.
- **Fork:** el **primer cambio** de quien no es dueño crea la casa nueva (`forkOf` = original, `ownerUid` = yo, mismo proyecto y mismos assets) y reemplaza la URL (`history.replaceState`). La edición no se bloquea mientras se crea (local-first) y es un solo paso de deshacer. Un aviso lo explica: «Creaste tu copia; el original no cambia» + enlace. No se crean forks por solo mirar.
- **Con colaboración (ADR-0011):** solo el anfitrión escribe en la nube (los invitados ya no autoguardan). Si el anfitrión no es dueño de la casa abierta, el primer cambio de cualquier participante hace el fork a nombre del anfitrión, y todos siguen editando el fork juntos. El mensaje `welcome` lleva el `houseId` para que los invitados conserven el enlace.
- **Dos pestañas del mismo dueño:** la escritura es una transacción que exige `rev` igual al leído; si otra pestaña guardó antes, se ofrece recargar o guardar como fork.

### Limpieza (GitHub Action)

`.github/workflows/cleanup.yml`: `schedule` diario + `workflow_dispatch` (con `dry-run`). Ejecuta `scripts/cloud/cleanup.mjs` con `firebase-admin` y la cuenta de servicio en el secreto `FIREBASE_SERVICE_ACCOUNT`:

1. Borra `houses` con `lastVisitAt` < ahora − 30 días (`BulkWriter`). La actividad del dueño también cuenta: guardar actualiza `lastVisitAt`.
2. Barrido de assets (marcar y barrer): junta los hashes referenciados por las casas que quedan y borra los `assets` (con sus trozos) que nadie referencia y tienen más de 1 día (para no borrar uno recién subido cuya casa aún no se guardó).
3. Publica un resumen en el log del job.

Se prueba contra el emulador en CI.

### Código (preparado para cuentas)

```
apps/web/src/features/cloud/
  ports.ts          Identity, HouseRepository, AssetRepository (interfaces; sin Firebase)
  house.ts          tipos: HouseRef, HouseAccess = 'owner' | 'visitor', estado de sincronización
  cloud-session.ts  orquesta: abrir por id, sincronizar, visita, fork al primer cambio
  firebase/         adaptador (único lugar que importa `firebase/*`, verificado por dependency-cruiser)
  memory/           adaptador en memoria para unit tests y E2E sin emulador
  ShareButton.tsx, CloudStatus.tsx
firebase/           firestore.rules, firestore.indexes.json, firebase.json (emuladores)
scripts/cloud/      cleanup.mjs
```

- `Identity` devuelve `{ uid, kind: 'anonymous' | 'account', displayName? }`. Las cuentas futuras son otra implementación y un botón «Iniciar sesión» que enlaza la credencial: el resto del código no cambia.
- «Mis casas» funciona desde ya con un registro local (IndexedDB) de casas creadas y visitadas; con cuentas, pasa a ser la consulta `houses where ownerUid == uid`.
- Configuración web de Firebase (pública por diseño) en variables `VITE_FIREBASE_*`, que el workflow de Pages toma de las _variables_ del repositorio. Sin configuración, la nube se desactiva y la app funciona como hoy (desarrollo local, tests).
- No se agrega hosting: Firebase se usa solo como base de datos y autenticación anónima; el sitio sigue en Pages.

## Consecuencias

- Compartir pasa a ser un enlace; el archivo `.decodeny.json/.zip` se mantiene para respaldo e intercambio.
- **Privacidad:** cualquiera con el enlace puede ver la casa. Se avisa al compartir (los corredores no deberían poner datos personales del cliente en el nombre).
- Si el navegador borra sus datos, se pierde la identidad anónima: la casa sigue visible pero editar crea un fork. Las cuentas futuras lo resuelven.
- Las casas sin visitas por 30 días desaparecen: se informa al compartir; exportar sigue disponible.
- Nueva dependencia operativa: un proyecto de Firebase (lo crea el dueño del repo), reglas desplegadas y un secreto en GitHub.

## Decisiones abiertas

1. **Qué es "la sesión".** Propuesta: la del **dueño** (el navegador que creó la casa la sigue editando siempre; los demás hacen fork al editar). Alternativa literal: la **pestaña** (al cerrarla, la casa queda congelada y hasta su autor hace fork al volver). El código es el mismo salvo la verificación de acceso.
2. **Cuándo se sube:** automático al primer cambio (propuesta) o solo al pulsar «Compartir».
3. **Despliegue de reglas:** a mano (`firebase deploy --only firestore`) o con un paso de workflow en `main`.
4. **Región** de Firestore (propuesta: `southamerica-west1`, Santiago) y plan Spark.
