import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV, type Env } from '../config/env.js';
import * as schema from './schema.js';

export const SQL = Symbol('SQL');
export const DB = Symbol('DB');
export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: SQL,
      inject: [ENV],
      useFactory: (env: Env) => postgres(env.DATABASE_URL, { max: 10 }),
    },
    {
      provide: DB,
      inject: [SQL],
      useFactory: (sql: postgres.Sql): Database => drizzle(sql, { schema }),
    },
  ],
  exports: [SQL, DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(SQL) private readonly sql: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
