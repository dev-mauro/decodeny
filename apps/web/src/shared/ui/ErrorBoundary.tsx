import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Contenido de reemplazo; recibe el error y una función para volver a intentar. */
  readonly fallback: (error: Error, retry: () => void) => ReactNode;
  readonly children: ReactNode;
  /** Cambiar esta clave reinicia el límite (p. ej. al abrir otro proyecto). */
  readonly resetKey?: unknown;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  readonly resetKey: unknown;
}

/**
 * Aísla fallas de render: un error en la vista 3D no debe tumbar los paneles (ni hacer perder
 * el trabajo, que sigue en el documento y en el autoguardado).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Decodeny] Error de render', error, info.componentStack);
  }

  readonly #retry = () => this.setState({ error: null });

  override render(): ReactNode {
    return this.state.error
      ? this.props.fallback(this.state.error, this.#retry)
      : this.props.children;
  }
}
