import { ConflictException } from '@nestjs/common';

/** Código de PostgreSQL para una restricción UNIQUE violada. */
const UNIQUE_VIOLATION = '23505';

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
