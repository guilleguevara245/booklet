import swc from 'unplugin-swc';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC emite la metadata de decoradores que necesita la inyección de dependencias de NestJS.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Carga apps/api/.env para las pruebas de integración contra PostgreSQL y Redis.
    // Los mails de las pruebas van a una bandeja en memoria.
    env: { ...loadEnv('test', process.cwd(), ''), MAIL_TRANSPORT: 'memory' },
  },
});
