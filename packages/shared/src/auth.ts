import { z } from 'zod';

// Esquemas de cuentas: registro, inicio de sesión y datos de la persona.

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email inválido' }).max(200));

export const PASSWORD_MIN = 10;

export const registerSchema = z.object({
  email,
  name: z.string().trim().min(1, 'No puede estar vacío').max(120),
  password: z
    .string()
    .min(PASSWORD_MIN, `Mínimo ${PASSWORD_MIN} caracteres`)
    .max(200, 'Máximo 200 caracteres'),
});
export type Register = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type Login = z.infer<typeof loginSchema>;

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
}

/**
 * Respuesta de registro e inicio de sesión. La web usa la cookie de sesión; las apps
 * nativas piden el token con el encabezado `X-Booklet-Client: native` y lo mandan como
 * `Authorization: Bearer`.
 */
export interface AuthResponse {
  user: User;
  token?: string;
}

export const SESSION_COOKIE = 'booklet_session';
export const NATIVE_CLIENT_HEADER = 'x-booklet-client';

/** Inicio con Google: el `credential` (ID token) que devuelve Google Identity Services. */
export const googleLoginSchema = z.object({
  idToken: z.string().min(20).max(4096),
});
export type GoogleLogin = z.infer<typeof googleLoginSchema>;
