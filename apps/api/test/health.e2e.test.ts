import { healthResponseSchema } from '@booklet/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory.js';
import { integrationReady } from './helpers.js';

// Necesita PostgreSQL y Redis reales (docker compose en local, servicios en CI).
const ready = integrationReady;

describe.skipIf(!ready)('GET /health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ CORS_ORIGIN: 'http://localhost:5173' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde 200 con la base de datos y Redis arriba', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.checks).toEqual({ database: 'up', redis: 'up' });
  });
});
