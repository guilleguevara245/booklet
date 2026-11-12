import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

export const REDIS = Symbol('REDIS');
const logger = new Logger('Redis');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
        // Avisa una sola vez cuando se pierde la conexión y otra cuando vuelve,
        // en vez de repetir el error en cada reintento.
        let connected = true;
        redis.on('error', (err) => {
          if (connected) logger.warn(`Sin conexión con Redis: ${err.message}`);
          connected = false;
        });
        redis.on('ready', () => {
          if (!connected) logger.log('Conexión con Redis restablecida');
          connected = true;
        });
        return redis;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
