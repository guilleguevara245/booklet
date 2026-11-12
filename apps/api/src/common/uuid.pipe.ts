import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** Valida un parámetro de ruta como UUID, con mensaje en castellano. */
export const UuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('El identificador no es un UUID válido'),
});
