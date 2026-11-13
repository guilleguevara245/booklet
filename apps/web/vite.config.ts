import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En desarrollo, /api apunta a la API local (apps/api). Se usa 127.0.0.1 y no
    // `localhost`: en Windows, `localhost` puede resolver a ::1 (IPv6) y la API escucha
    // en IPv4, así que el proxy no la encuentra y responde 502.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Avisos en tiempo real (Socket.IO) de la API local.
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
