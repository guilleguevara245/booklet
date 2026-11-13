import { expect } from '@playwright/test';

/**
 * Lectura de la casilla de Mailpit (el servidor SMTP de prueba de docker compose y de CI).
 * Las pruebas de mails solo corren si MAILPIT_URL está definida y la API manda por SMTP.
 */
export const MAILPIT_URL = process.env.MAILPIT_URL;

interface Summary {
  ID: string;
  Subject: string;
}

/** Espera el mail para esa dirección cuyo asunto contiene el texto, y devuelve su texto plano. */
export async function waitForMail(to: string, subject: string): Promise<string> {
  let found: Summary | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${to}"`);
        const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        const { messages } = (await res.json()) as { messages: Summary[] };
        found = messages.find((m) => m.Subject.includes(subject));
        return found?.Subject;
      },
      { message: `mail "${subject}" para ${to}`, timeout: 15_000 },
    )
    .toContain(subject);
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
  return ((await res.json()) as { Text: string }).Text;
}

/** El primer link del mail que apunta a esa ruta de la web, como ruta relativa. */
export function linkIn(text: string, path: string): string {
  const match = text.match(new RegExp(`https?://[^\\s]+(${path}[^\\s)]*)`));
  if (!match) throw new Error(`El mail no tiene un link a ${path}:\n${text}`);
  return match[1]!;
}
