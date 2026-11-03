import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { eq, and, lt } from 'drizzle-orm';
import { db } from '../src/db';
import { builds } from '../src/db/schema';
import { unpack } from '../src/lib/archive';
import { storeBuild } from '../src/lib/hosted-storage';
import { getObject, deleteObject, sourceKey, MAX_ZIP_BYTES } from '../src/lib/object-storage';

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
const once = process.argv.includes('--once');
const cleanError = (error: unknown) => error instanceof Error && !/https?:|credential|password|secret/i.test(error.message) ? error.message.slice(0, 250) : 'No pudimos procesar el archivo. Volvé a intentar o subí otro paquete.';

async function claimBuild() {
  return db().transaction(async tx => {
    const [row] = await tx.select().from(builds).where(eq(builds.status, 'queued')).orderBy(builds.createdAt).limit(1).for('update', { skipLocked: true });
    if (!row) return null;
    const processingToken = randomUUID();
    await tx.update(builds).set({ status: 'processing', processingAt: new Date(), processingToken, error: null }).where(eq(builds.id, row.id));
    return { ...row, processingToken };
  });
}
async function processBuild(row: NonNullable<Awaited<ReturnType<typeof claimBuild>>>) {
  const owns = and(eq(builds.id, row.id), eq(builds.status, 'processing'), eq(builds.processingToken, row.processingToken));
  const heartbeat = setInterval(() => { void db().update(builds).set({ processingAt: new Date() }).where(owns).catch(console.error); }, 30_000);
  try {
    const archive = await getObject(sourceKey(row.gameId, row.id), MAX_ZIP_BYTES);
    if (archive.length !== row.sourceBytes) throw new Error('El tamaño del ZIP no coincide con la subida.');
    const files = await unpack(archive);
    const manifest = await storeBuild(row.gameId, row.id, row.processingToken, files);
    const ready = await db().update(builds).set({ status: 'ready', artifactId: row.processingToken, digest: createHash('sha256').update(archive).digest('hex'), manifest, bytes: [...files.values()].reduce((sum, body) => sum + body.length, 0), fileCount: files.size, processingToken: null, updatedAt: new Date() }).where(owns).returning({ id: builds.id });
    if (ready.length) await deleteObject(sourceKey(row.gameId, row.id)).catch(console.error);
  } catch (error) {
    await db().update(builds).set({ status: 'failed', error: cleanError(error), processingToken: null, updatedAt: new Date() }).where(owns);
  } finally { clearInterval(heartbeat); }
}
async function recoverInterrupted() {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  await db().update(builds).set({ status: 'failed', error: 'El procesamiento se interrumpió. Podés reintentarlo.', processingToken: null }).where(and(eq(builds.status, 'processing'), lt(builds.processingAt, cutoff)));
}
async function main() {
  do {
    await recoverInterrupted();
    const build = await claimBuild();
    if (build) await processBuild(build);
    if (once) { if (!build) break; } else if (!build && !stopping) await new Promise(resolve => setTimeout(resolve, 1500));
  } while (!stopping);
}
main().then(() => process.exit(0)).catch(error => { console.error('SaltoUruguayServer hosted worker:', cleanError(error)); process.exit(1); });
