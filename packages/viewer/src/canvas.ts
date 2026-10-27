/**
 * Entrada de la vista 3D (Three.js + React Three Fiber). Está separada del índice para que la
 * aplicación la cargue bajo demanda (`import('@decodeny/viewer/canvas')`): la planta, los
 * patrones de materiales y los contratos del índice no arrastran WebGL a la carga inicial.
 */
export { DecodenyViewer, type DecodenyViewerProps } from './DecodenyViewer';
