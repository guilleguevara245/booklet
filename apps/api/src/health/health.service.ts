import { Inject, Injectable } from '@nestjs/common';
import { overallStatus, type DependencyStatus, type HealthResponse } from '@booklet/shared';
import type { Redis } from 'ioredis';
import type postgres from 'postgres';
import { SQL } from '../database/database.module.js';
import { REDIS } from '../redis/redis.module.js';

const CHECK_TIMEOUT_MS = 2000;
const VERSION = process.env.npm_package_version ?? '0.0.0';

/** Corre una verificación con tope de tiempo: si no responde a tiempo, cuenta como caída. */
export async function probe(check: () => Promise<unknown>, timeoutMs = CHECK_TIMEOUT_MS) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'up' satisfies DependencyStatus;
  } catch {
    return 'down' satisfies DependencyStatus;
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(SQL) private readonly sql: postgres.Sql,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      probe(() => this.sql`select 1`),
      probe(() => this.redis.ping()),
    ]);
    const checks = { database, redis };
    return {
      status: overallStatus(checks),
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    };
  }
}
