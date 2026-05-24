import type { Interceptor } from '@/types/interceptors';

/**
 * Placeholder. Los interceptores se renderizan dentro de CesiumMap si
 * se conecta el store de interceptores. Por ahora la app fija enfasis
 * en pistas+recomendaciones, los interceptores se muestran en panel.
 */
export interface InterceptorEntityProps {
  interceptor: Interceptor;
}
export function InterceptorEntity(_props: InterceptorEntityProps): null {
  return null;
}
