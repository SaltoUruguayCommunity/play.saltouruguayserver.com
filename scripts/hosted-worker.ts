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
async function claimMedia() {
  return db().transaction(async tx => {
    const [row] = await tx.select().from(gameMedia).where(eq(gameMedia.status, 'queued')).orderBy(gameMedia.createdAt).limit(1).for('update', { skipLocked: true });
    if (!row) return null;
    const processingToken = randomUUID();
    await tx.update(gameMedia).set({ status: 'processing', processingAt: new Date(), processingToken, error: null }).where(eq(gameMedia.id, row.id));
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
async function processMedia(row: NonNullable<Awaited<ReturnType<typeof claimMedia>>>) {
  const owns = and(eq(gameMedia.id, row.id), eq(gameMedia.status, 'processing'), eq(gameMedia.processingToken, row.processingToken));
  const heartbeat = setInterval(() => { void db().update(gameMedia).set({ processingAt: new Date() }).where(owns).catch(console.error); }, 30_000);
  try {
    const original = await getObject(sourceKey(row.gameId, row.id), MAX_IMAGE_BYTES);
    if (original.length !== row.sourceBytes) throw new Error('El tamaño de la imagen no coincide.');
    const input = sharp(original, { limitInputPixels: 40_000_000, animated: false });
    const meta = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || !meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new Error('Usá una imagen PNG, JPG o WebP estática.');
    if (row.kind === 'icon' && (meta.width < 128 || meta.height < 128)) throw new Error('El icono necesita al menos 128 × 128 píxeles.');
    if (row.kind !== 'icon' && (meta.width < 320 || meta.height < 180)) throw new Error('La imagen necesita al menos 320 × 180 píxeles.');
    const image = row.kind === 'icon' ? input.rotate().resize(512, 512, { fit: 'cover' }) : input.rotate().resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true });
    const { data, info } = await image.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const artifactKey = imageKey(row.gameId, row.id, row.processingToken);
    await putObject(artifactKey, data, 'image/webp');
    const ready = await db().update(gameMedia).set({ status: 'ready', artifactKey, width: info.width, height: info.height, bytes: data.length, processingToken: null, updatedAt: new Date() }).where(owns).returning({ id: gameMedia.id });
    if (ready.length) await deleteObject(sourceKey(row.gameId, row.id)).catch(console.error);
  } catch (error) {
    await db().update(gameMedia).set({ status: 'failed', error: cleanError(error), processingToken: null, updatedAt: new Date() }).where(owns);
  } finally { clearInterval(heartbeat); }
}
async function recoverInterrupted() {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  await db().update(builds).set({ status: 'failed', error: 'El procesamiento se interrumpió. Podés reintentarlo.', processingToken: null }).where(and(eq(builds.status, 'processing'), lt(builds.processingAt, cutoff)));
  await db().update(gameMedia).set({ status: 'failed', error: 'El procesamiento se interrumpió. Podés reintentarlo.', processingToken: null }).where(and(eq(gameMedia.status, 'processing'), lt(gameMedia.processingAt, cutoff)));
}
async function main() {
  do {
    await recoverInterrupted();
    const build = await claimBuild();
    if (build) await processBuild(build);
    const media = await claimMedia();
    if (media) await processMedia(media);
    if (once) { if (!build && !media) break; } else if (!build && !media && !stopping) await new Promise(resolve => setTimeout(resolve, 1500));
  } while (!stopping);
}
main().then(() => process.exit(0)).catch(error => { console.error('SaltoUruguayServer hosted worker:', cleanError(error)); process.exit(1); });
