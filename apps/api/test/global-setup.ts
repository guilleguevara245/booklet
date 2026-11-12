import { loadEnv } from 'vite';
import { runMigrations } from '../src/database/migrate.js';

/** Aplica las migraciones una sola vez antes de las pruebas de integración. */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? loadEnv('test', process.cwd(), '').DATABASE_URL;
  if (url) await runMigrations(url);
}
