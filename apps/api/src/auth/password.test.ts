import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('contraseñas', () => {
  it('verifica la contraseña correcta y rechaza otra', async () => {
    const hash = await hashPassword('una contraseña larga');
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
    await expect(verifyPassword('una contraseña larga', hash)).resolves.toBe(true);
    await expect(verifyPassword('otra contraseña larga', hash)).resolves.toBe(false);
  });

  it('usa una sal distinta cada vez', async () => {
    const [a, b] = await Promise.all([hashPassword('igual igual'), hashPassword('igual igual')]);
    expect(a).not.toBe(b);
  });

  it('trata igual las formas Unicode equivalentes de un acento', async () => {
    const hash = await hashPassword('contraseña segura'); // ñ en un solo carácter
    await expect(verifyPassword('contraseña segura', hash)).resolves.toBe(true); // n + tilde
  });

  it('rechaza un hash con formato desconocido', async () => {
    await expect(verifyPassword('x', 'bcrypt$algo')).resolves.toBe(false);
  });
});
