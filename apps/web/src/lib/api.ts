/** URL base de la API. En desarrollo, Vite redirige `/api` a la API local. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

/** Error de la API con su estado HTTP, el mensaje y, si es de validación, cada campo. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensaje del campo indicado, si la API marcó un problema ahí. */
  field(path: string): string | undefined {
    return this.issues.find((i) => i.path === path)?.message;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Pide algo a la API con la cookie de sesión (`credentials: 'include'`), así funciona
 * también cuando la web y la API están en dominios distintos.
 */
export async function api<T>(
  method: Method,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new ApiError(res.status, message ?? `Error ${res.status}`, data.issues ?? []);
  }
  return data as T;
}
