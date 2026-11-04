import { createHash, randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { builds } from '../db/schema';
import { unpack } from './archive';
import { storeBuild } from './hosted-storage';
import { deleteObject, getObject, MAX_ZIP_BYTES, sourceKey } from './object-storage';

export const cleanBuildError = (error: unknown) => error instanceof Error && !/https?:|credential|password|secret/i.test(error.message) ? error.message.slice(0, 250) : 'No pudimos procesar el archivo. Volvé a intentar o subí otro paquete.';

export async function claimBuild(id?: string) {
  return db().transaction(async tx => {
    const [row] = await tx.select().from(builds).where(and(eq(builds.status, 'queued'), id ? eq(builds.id, id) : undefined)).orderBy(builds.createdAt).limit(1).for('update', { skipLocked: true });
    if (!row) return null;
    const processingToken = randomUUID();
    await tx.update(builds).set({ status: 'processing', processingAt: new Date(), processingToken, error: null, updatedAt: new Date() }).where(eq(builds.id, row.id));
    return { ...row, processingToken };
  });
}

export async function processClaimedBuild(row: NonNullable<Awaited<ReturnType<typeof claimBuild>>>, preparedArchive?: Buffer) {
  const owns = and(eq(builds.id, row.id), eq(builds.status, 'processing'), eq(builds.processingToken, row.processingToken));
  const heartbeat = setInterval(() => { void db().update(builds).set({ processingAt: new Date() }).where(owns).catch(() => {}); }, 30_000);
  try {
    const archive = preparedArchive ?? await getObject(sourceKey(row.gameId, row.id), MAX_ZIP_BYTES);
    if (archive.length !== row.sourceBytes) throw new Error('El tamaño del ZIP no coincide con la subida.');
    const files = await unpack(archive);
    const manifest = await storeBuild(row.gameId, row.id, row.processingToken, files);
    const ready = await db().update(builds).set({ status: 'ready', artifactId: row.processingToken, digest: createHash('sha256').update(archive).digest('hex'), manifest, bytes: [...files.values()].reduce((sum, body) => sum + body.length, 0), fileCount: files.size, processingToken: null, error: null, updatedAt: new Date() }).where(owns).returning({ id: builds.id });
    if (ready.length) await deleteObject(sourceKey(row.gameId, row.id)).catch(() => {});
  } catch (error) {
    await db().update(builds).set({ status: 'failed', error: cleanBuildError(error), processingToken: null, updatedAt: new Date() }).where(owns);
  } finally { clearInterval(heartbeat); }
}

export async function processQueuedBuild(id?: string, archive?: Buffer) {
  const claimed = await claimBuild(id);
  if (!claimed) return false;
  await processClaimedBuild(claimed, archive);
  return true;
}

export async function recoverInterruptedBuilds() {
  await db().update(builds).set({ status: 'failed', error: 'El procesamiento se interrumpió. Podés reintentarlo.', processingToken: null, updatedAt: new Date() }).where(and(eq(builds.status, 'processing'), lt(builds.processingAt, new Date(Date.now() - 10 * 60_000))));
}
