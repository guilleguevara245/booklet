type Listener = (...args: unknown[]) => void;

/**
 * Socket.IO falso para las pruebas: `join` responde ok y `push` simula un aviso que manda
 * el servidor.
 */
export class FakeSocket {
  connected = false;
  joined: string[] = [];
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  }

  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    if (event === 'join') {
      this.joined.push(args[0] as string);
      (args[1] as (r: unknown) => void)?.({ ok: true });
    }
    return this;
  }

  connect() {
    this.connected = true;
    queueMicrotask(() => this.fire('connect'));
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  /** Simula un aviso del servidor. */
  push(event: string, payload: unknown) {
    this.fire(event, payload);
  }

  private fire(event: string, ...args: unknown[]) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn(...args);
  }
}

export const fakeSocket = { current: new FakeSocket() };
