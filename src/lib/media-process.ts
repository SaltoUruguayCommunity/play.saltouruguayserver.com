import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { gameMedia } from '@/db/schema';
import { getObject, putObject, deleteObject, sourceKey, imageKey, MAX_IMAGE_BYTES } from './object-storage';

const cleanError = (error: unknown) =>
  error instanceof Error && !/https?:|credential|password|secret/i.test(error.message)
    ? error.message.slice(0, 250)
    : 'No pudimos procesar el archivo. Volvé a intentar o subí otro.';

/** Process an uploaded image inline: validate, resize, convert to WebP and store the result. */
export async function processMediaInline(
  gameId: string,
  mediaId: string,
  kind: 'icon' | 'banner' | 'screenshot',
  sourceBytes: number,
): Promise<{ status: 'ready' | 'failed'; error?: string }> {
  const artifactId = randomUUID();
  try {
    const original = await getObject(sourceKey(gameId, mediaId), MAX_IMAGE_BYTES);
    if (original.length !== sourceBytes) throw new Error('El tamaño de la imagen no coincide.');
    const input = sharp(original, { limitInputPixels: 40_000_000, animated: false });
    const meta = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || !meta.width || !meta.height || (meta.pages ?? 1) > 1)
      throw new Error('Usá una imagen PNG, JPG o WebP estática.');
    if (kind === 'icon' && (meta.width < 128 || meta.height < 128))
      throw new Error('El icono necesita al menos 128 × 128 píxeles.');
    if (kind !== 'icon' && (meta.width < 320 || meta.height < 180))
      throw new Error('La imagen necesita al menos 320 × 180 píxeles.');
    const image =
      kind === 'icon'
        ? input.rotate().resize(512, 512, { fit: 'cover' })
        : input.rotate().resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true });
    const { data, info } = await image.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const artifactKey = imageKey(gameId, mediaId, artifactId);
    await putObject(artifactKey, data, 'image/webp');
    await db()
      .update(gameMedia)
      .set({ status: 'ready', artifactKey, width: info.width, height: info.height, bytes: data.length, updatedAt: new Date() })
      .where(and(eq(gameMedia.id, mediaId), eq(gameMedia.gameId, gameId)));
    await deleteObject(sourceKey(gameId, mediaId)).catch(() => {});
    return { status: 'ready' };
  } catch (error) {
    const message = cleanError(error);
    await db()
      .update(gameMedia)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(and(eq(gameMedia.id, mediaId), eq(gameMedia.gameId, gameId)));
    return { status: 'failed', error: message };
  }
}
