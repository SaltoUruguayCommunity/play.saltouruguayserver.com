import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

export default function migrateDatabaseIntegration(): AstroIntegration {
  return {
    name: 'migrate-database-integration',
    hooks: {
      'astro:build:done': async ({ logger }) => {
        logger.info('Starting database migration...');
        await new Promise<void>((resolve, reject) => {
          const child = spawn('pnpm', ['db:migrate'], {
            cwd: fileURLToPath(new URL('../../', import.meta.url)),
            stdio: 'inherit',
            shell: process.platform === 'win32',
            env: process.env,
          });
          child.once('error', reject);
          child.once('exit', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error(`Database migration failed (${signal ?? code ?? 'unknown'}).`));
          });
        });
        logger.info('Database migration completed successfully.');
      },
    },
  };
}
