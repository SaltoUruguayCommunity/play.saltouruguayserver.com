import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { publicObjectUrl } from './public-assets';

export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const storageRoot = () => resolve(process.env.HOSTED_STORAGE_PATH || '.data/hosted');
export const cloudStorage = () => Boolean(process.env.S3_BUCKET);
/** Physical bucket namespace. Stored artifact keys remain relative to this prefix. */
export function storageKey(key: string) {
  if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid object key');
  const raw = (process.env.S3_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');
  if (!raw) return key;
  const parts = raw.split('/');
  if (parts.some(part => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) || part === '.' || part === '..')) throw new Error('S3_PREFIX must contain safe path segments, not a URL.');
  return parts.join('/') + '/' + key;
}
let client: S3Client | undefined;
function s3() {
  if (!process.env.S3_BUCKET) throw new Error('S3_BUCKET is required');
  return client ??= new S3Client({
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    region: process.env.S3_REGION || 'us-east-1', endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } : undefined,
  });
}
function localPath(key: string) {
  const root = storageRoot(), target = resolve(root, key);
  if (!key || key.includes('\\') || key.split('/').some(p => p === '..' || p.startsWith('.')) || !target.startsWith(root + sep)) throw new Error('Invalid object key');
  return target;
}
export function assertStorageAvailable() {
  if (process.env.VERCEL && !cloudStorage()) throw new Error('Configurá S3/R2 para las subidas en producción.');
}
export async function signedUpload(key: string, type: string, size: number) {
  assertStorageAvailable();
  if (!cloudStorage()) return null;
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey(key), ContentType: type, ContentLength: size }), { expiresIn: 900 });
}
export async function putObject(key: string, body: Buffer, type: string) {
  assertStorageAvailable();
  if (cloudStorage()) await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey(key), Body: body, ContentType: type }));
  else { const target = localPath(key); await mkdir(dirname(target), { recursive: true }); await writeFile(target, body); }
}
export async function headObject(key: string) {
  if (cloudStorage()) { const head = await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey(key) })); return { bytes: head.ContentLength ?? 0 }; }
  return { bytes: (await stat(localPath(key))).size };
}
export async function getObject(key: string, maxBytes: number): Promise<Buffer> {
  const head = await headObject(key);
  if (head.bytes > maxBytes) throw new Error('El archivo supera el tamaño permitido.');
  if (!cloudStorage()) { const data = await readFile(localPath(key)); if (data.length > maxBytes) throw new Error('Archivo demasiado grande.'); return data; }
  const result = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey(key) }));
  if (!result.Body) throw new Error('Archivo no disponible.');
  const parts: Uint8Array[] = []; let size = 0;
  for await (const part of result.Body as AsyncIterable<Uint8Array>) {
    size += part.byteLength;
    if (size > maxBytes) { (result.Body as { destroy?: () => void }).destroy?.(); throw new Error('Archivo demasiado grande.'); }
    parts.push(part);
  }
  return Buffer.concat(parts);
}
export async function deleteObject(key: string) {
  if (cloudStorage()) await s3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey(key) }));
  else await unlink(localPath(key)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}
export const sourceKey = (gameId: string, id: string) => `incoming/${gameId}/${id}/source`;
export const buildKey = (gameId: string, buildId: string, artifactId: string, name: string) => `games/${gameId}/builds/${buildId}/${artifactId}/${name}`;
export const imageKey = (gameId: string, id: string, artifactId: string) => `media/${gameId}/${id}/${artifactId}.webp`;

export async function openObject(key: string, range?: { start: number; end: number }): Promise<AsyncIterable<Uint8Array>> {
 if (!cloudStorage()) return createReadStream(localPath(key), range);
 const publicUrl = publicObjectUrl(key);
 if (publicUrl) {
  const response = await fetch(publicUrl, { headers: range ? { Range: 'bytes=' + range.start + '-' + range.end } : {} });
  if (!response.ok || !response.body || (range && response.status !== 206)) {
   await response.body?.cancel();
   throw new Error('Public object unavailable or Range requests unsupported');
  }
  const reader = response.body.getReader();
  return (async function* () {
   try { while (true) { const { value, done } = await reader.read(); if (done) return; yield value; } }
   finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  })();
 }
 const result = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey(key), ...(range ? { Range: 'bytes=' + range.start + '-' + range.end } : {}) }));
 if (!result.Body) throw new Error('Object unavailable');
 return result.Body as AsyncIterable<Uint8Array>;
}
