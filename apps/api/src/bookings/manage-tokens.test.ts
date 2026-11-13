import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { ManageTokens } from './manage-tokens.js';

const tokens = (secret: string) =>
  new ManageTokens({ APP_SECRET: secret, WEB_URL: 'https://booklet.app' } as Env);

describe('ManageTokens', () => {
  const a = tokens('a'.repeat(32));

  it('da siempre el mismo token para un turno, y uno distinto para otro', () => {
    expect(a.forBooking('turno-1')).toBe(a.forBooking('turno-1'));
    expect(a.forBooking('turno-1')).not.toBe(a.forBooking('turno-2'));
  });

  it('sin la clave no se puede armar el token', () => {
    expect(tokens('b'.repeat(32)).forBooking('turno-1')).not.toBe(a.forBooking('turno-1'));
  });

  it('arma el link de la web con un token que entra en la URL', () => {
    expect(a.url('turno-1')).toMatch(/^https:\/\/booklet\.app\/turno\/[\w-]{43}$/);
  });
});
