/**
 * Cursor de la herramienta de medición: una regla con marcas rojas, con la punta (arriba a la
 * izquierda) como punto activo. Si el navegador no admite cursores propios, una cruz.
 */
const RULER_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g transform='rotate(45 16 16)'><rect x='2' y='11' width='28' height='10' rx='1.5' fill='#fef3c7' stroke='#1e293b' stroke-width='1.5'/><path d='M6 11v4M10 11v6M14 11v4M18 11v6M22 11v4M26 11v6' stroke='#dc2626' stroke-width='1.5'/></g></svg>`;

export const RULER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(RULER_SVG)}") 5 5, crosshair`;
