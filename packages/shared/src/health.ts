import { z } from 'zod';

/** Estado de una dependencia externa de la API (base de datos, Redis, etc.). */
export const dependencyStatusSchema = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

/** Respuesta de `GET /health`, compartida entre la API y los clientes. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    database: dependencyStatusSchema,
    redis: dependencyStatusSchema,
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Calcula el estado general: `ok` solo si todas las dependencias responden. */
export function overallStatus(checks: HealthResponse['checks']): HealthResponse['status'] {
  return Object.values(checks).every((s) => s === 'up') ? 'ok' : 'degraded';
}
