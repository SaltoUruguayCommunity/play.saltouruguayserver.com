import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
export const storageRoot = () => resolve(process.env.HOSTED_STORAGE_PATH || '.data/hosted');
export async function storeBuild(gameId: string, buildId: string, files: Map<string, Buffer>) {
  const root = resolve(storageRoot(), gameId, buildId);
  for (const [name, data] of files) { const target = resolve(root, name); if (!target.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Invalid storage path'); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data, { flag: 'wx' }); }
}
export async function publishBuild(gameId: string, buildId: string) { const root = resolve(storageRoot(), gameId); await mkdir(root, { recursive: true }); await writeFile(resolve(root, 'published.json'), JSON.stringify({ buildId }), 'utf8'); }
