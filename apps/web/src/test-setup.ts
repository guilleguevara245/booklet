import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetSocket } from './lib/realtime';
import { fakeSocket, FakeSocket } from './test/fake-socket';

// La web nunca abre un WebSocket real en las pruebas: usa el socket falso.
vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('./test/fake-socket');
  return { io: () => fakeSocket.current };
});

// Sin `globals` de Vitest, Testing Library no limpia sola entre pruebas.
afterEach(() => cleanup());

// Cada prueba arranca con un socket nuevo.
beforeEach(() => {
  resetSocket();
  fakeSocket.current = new FakeSocket();
});
