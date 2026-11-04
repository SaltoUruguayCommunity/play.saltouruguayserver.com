import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { attachDatabasePool } from '@vercel/functions';
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;
export const databaseConfigured = () => Boolean(import.meta.env?.DATABASE_URL || process.env.DATABASE_URL);
export function db() {
  const url = import.meta.env?.DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!instance) {
    const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 });
    if (process.env.VERCEL) attachDatabasePool(pool);
    instance = drizzle(pool, { schema });
  }
  return instance;
}
