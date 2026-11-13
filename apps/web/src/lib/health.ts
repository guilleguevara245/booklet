import { healthResponseSchema, type HealthResponse } from '@booklet/shared';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Pide el estado de la API. Un 503 también trae el detalle de cada dependencia,
 * así que se valida el cuerpo en los dos casos.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { signal });
  if (!res.ok && res.status !== 503) {
    throw new Error(`La API respondió ${res.status}`);
  }
  return healthResponseSchema.parse(await res.json());
}
