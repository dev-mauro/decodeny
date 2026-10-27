/**
 * Límites de capas (ver docs/architecture.md y ADR-001/003):
 *   domain ← catalog ← viewer ← web
 * El dominio es TypeScript puro; el visor no conoce la UI; nada depende de la app.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'El dominio no puede depender del visor, la app, React ni Three.js.',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: {
        path: [
          '^packages/(viewer|catalog)',
          '^apps/',
          '^(@decodeny/viewer|@decodeny/catalog|@decodeny/web|react|react-dom|three|@react-three/)',
          'node_modules/(react|react-dom|three|@react-three)/',
        ],
      },
    },
    {
      name: 'catalog-is-content',
      comment:
        'El catálogo son datos y generadores puros: solo depende del dominio (sin visor, UI ni Three.js).',
      severity: 'error',
      from: { path: '^packages/catalog/src' },
      to: {
        path: [
          '^packages/viewer',
          '^apps/',
          '^(@decodeny/viewer|@decodeny/web|react|react-dom|three|@react-three/)',
          'node_modules/(react|react-dom|three|@react-three)/',
        ],
      },
    },
    {
      name: 'viewer-not-ui',
      comment: 'El visor no puede depender de la aplicación web.',
      severity: 'error',
      from: { path: '^packages/viewer/src' },
      to: { path: ['^apps/', '^@decodeny/web'] },
    },
    {
      name: 'firebase-behind-ports',
      comment:
        'Solo el adaptador (features/cloud/firebase) usa Firebase; el resto de la app depende de los puertos (ADR-0012).',
      severity: 'error',
      from: { path: '^apps/web/src', pathNot: '^apps/web/src/features/cloud/firebase/' },
      to: { path: ['node_modules/(firebase|@firebase)/'] },
    },
    {
      name: 'not-to-unresolvable',
      comment:
        'Toda importación debe resolverse (dependencia declarada en el package.json del paquete).',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-test-imports-in-src',
      comment: 'El código de producción no importa tests ni utilidades de test.',
      severity: 'error',
      from: { pathNot: '[.]test[.]tsx?$|/test-utils/' },
      to: { path: '[.]test[.]tsx?$|/test-utils/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Solo los builds y reportes del repo (los paquetes de node_modules también viven en `dist/`).
    exclude: { path: '^(apps|packages)/[^/]+/(dist|coverage|e2e)/|[.]config[.]ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.tools.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js'],
    },
  },
};
