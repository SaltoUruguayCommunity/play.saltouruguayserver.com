import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { builds } from '../db/schema';
import { inspectArchive } from './archive';
import { cleanBuildError, processQueuedBuild } from './build-process';
import { getObject, sourceKey } from './object-storage';

const MiB = 1024 * 1024;
export const inlineBuildLimits = { compressedBytes: 5 * MiB, expandedBytes: 20 * MiB, entries: 100 } as const;

/** ZIPs already live in S3/R2. The Function only receives a small confirmation. */
export async function dispatchBuild(gameId: string, id: string, sourceBytes: number) {
  let archive: Buffer | undefined;
  let inline = false;
  if (sourceBytes <= inlineBuildLimits.compressedBytes) {
    try {
      archive = await getObject(sourceKey(gameId, id), inlineBuildLimits.compressedBytes);
      if (archive.length !== sourceBytes) throw new Error('El tamaño del ZIP no coincide con la subida.');
      const info = await inspectArchive(archive);
      inline = info.expandedBytes <= inlineBuildLimits.expandedBytes && info.entries <= inlineBuildLimits.entries;
    } catch (error) {
      await db().update(builds).set({ status: 'failed', error: cleanBuildError(error), updatedAt: new Date() }).where(and(eq(builds.id, id), eq(builds.gameId, gameId), eq(builds.status, 'queued')));
      const [row] = await db().select({ status: builds.status, error: builds.error }).from(builds).where(eq(builds.id, id));
      return { status: row?.status ?? 'failed', error: row?.error, mode: 'inline' as const };
    }
  }
  const work = processQueuedBuild(id, archive).catch(() => { console.error('[SaltoPlay] Build processing unavailable; the persisted job can be retried.'); });
  if (!inline && process.env.VERCEL) {
    waitUntil(work);
    return { status: 'queued', mode: 'background' as const };
  }
  // Outside Vercel, do not detach a promise whose host has no waitUntil lifecycle.
  await work;
  const [row] = await db().select({ status: builds.status, error: builds.error }).from(builds).where(eq(builds.id, id));
  return { status: row?.status ?? 'failed', error: row?.error, mode: 'inline' as const };
}
