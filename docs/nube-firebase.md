# Nube (Firebase): configuración

Las maquetas compartidas (ADR-0012) usan **Firestore** y **Auth anónima** de un proyecto de Firebase. El sitio sigue en GitHub Pages: Firebase es solo la base de datos. Sin esta configuración la app funciona igual, con maquetas solo locales (el botón «Compartir» no aparece).

## 1. En Firebase (una vez)

1. **Authentication → Método de acceso → Anónimo:** habilitar.
2. **Authentication → Configuración → Dominios autorizados:** agregar `dev-mauro.github.io` (y `localhost` para desarrollo, que suele venir).
3. **Firestore:** la base ya creada (modo producción). Las reglas e índices los despliega el workflow; no hace falta editarlos en la consola.
4. **Restringir la API key** (Google Cloud Console → APIs y servicios → Credenciales → la «Browser key»): referentes HTTP `https://dev-mauro.github.io/*` y `http://localhost:*/*`. La configuración web no es secreta; esto evita que otro sitio use tu cuota.

## 2. En GitHub (Settings → Secrets and variables → Actions)

**Variables** (pestaña _Variables_; públicas, las usa el build de Pages):

| Variable               | Valor (de tu `firebaseConfig`) |
| ---------------------- | ------------------------------ |
| `FIREBASE_API_KEY`     | `apiKey`                       |
| `FIREBASE_AUTH_DOMAIN` | `authDomain`                   |
| `FIREBASE_PROJECT_ID`  | `projectId`                    |
| `FIREBASE_APP_ID`      | `appId`                        |

**Secretos** (pestaña _Secrets_): dos cuentas de servicio, cada una con lo justo. Se crean en Google Cloud Console → IAM y administración → Cuentas de servicio → Crear; después, en la cuenta: Claves → Agregar clave → JSON, y se pega el contenido completo del archivo como valor del secreto (luego borra el archivo).

| Secreto                    | Para qué                                          | Roles                                                                                                         |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT` | Limpieza diaria (`cleanup.yml`)                   | Usuario de Cloud Datastore                                                                                    |
| `FIREBASE_DEPLOY_SA`       | Desplegar reglas e índices (`firebase-rules.yml`) | Administrador de reglas de Firebase, Administrador de índices de Cloud Datastore, Consumidor de Service Usage |

Esas claves ignoran las reglas de seguridad: trátalas como contraseñas. Si tu organización bloquea la creación de claves, la alternativa es Workload Identity Federation (sin claves).

## 3. Primer despliegue

- Reglas e índices: Actions → «Reglas de Firestore» → _Run workflow_ (después corre solo cuando cambia `firebase/`).
- Sitio con nube: el próximo push a `main` (o Actions → «Publicar en GitHub Pages» → _Run workflow_).
- Limpieza: corre todos los días; para probarla, Actions → «Limpieza de maquetas» → _Run workflow_ con simulación.

## Desarrollo local

- Con tu proyecto real: `apps/web/.env.local` (ignorado por git) con `VITE_FIREBASE_API_KEY=…`, `VITE_FIREBASE_PROJECT_ID=…`, `VITE_FIREBASE_APP_ID=…` y `pnpm dev`.
- Con los emuladores (sin tocar datos reales; requiere **Java 21+**):
  - `pnpm test:cloud`: reglas y limpieza.
  - `pnpm e2e:cloud`: E2E con la nube (la app se compila apuntando a los emuladores).
  - Con un Java anterior: `FIREBASE_CLI="pnpm dlx firebase-tools@13.35.1"` delante del comando (`e2e:cloud`), o `pnpm dlx firebase-tools@13.35.1 emulators:exec …` para `test:cloud`.
