import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;
export const databaseConfigured = () => Boolean(import.meta.env.DATABASE_URL || process.env.DATABASE_URL);
export function db() {
  const url = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED');
  instance ??= drizzle(new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 }), { schema });
  return instance;
}
