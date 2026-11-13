import { ConflictException } from '@nestjs/common';

/** Código de PostgreSQL para una restricción UNIQUE violada. */
const UNIQUE_VIOLATION = '23505';
/** Código de PostgreSQL para una restricción de exclusión violada (turnos superpuestos). */
const EXCLUSION_VIOLATION = '23P01';

function pgCode(err: unknown): string | undefined {
  // Drizzle envuelve el error del driver en `cause`.
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** Convierte un duplicado en 409 con un mensaje claro; cualquier otro error sigue de largo. */
export function rethrowUnique(err: unknown, message: string): never {
  if (pgCode(err) === UNIQUE_VIOLATION) throw new ConflictException(message);
  throw err;
}

/** Convierte un turno superpuesto en 409; cualquier otro error sigue de largo. */
export function rethrowOverlap(err: unknown, message: string): never {
  if (pgCode(err) === EXCLUSION_VIOLATION) throw new ConflictException(message);
  throw err;
}
