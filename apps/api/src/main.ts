import 'reflect-metadata';
import { createApp } from './app.factory.js';
import { loadEnv } from './config/env.js';
import { runMigrations } from './database/migrate.js';

const env = loadEnv();
// Las migraciones pendientes se aplican antes de aceptar pedidos.
await runMigrations(env.DATABASE_URL);
const app = await createApp(env);
await app.listen({ port: env.PORT, host: '0.0.0.0' });
