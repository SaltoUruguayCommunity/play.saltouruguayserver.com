import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db';
import { games, builds, gameMedia, releases } from '../src/db/schema';
import { openObject, buildKey } from '../src/lib/object-storage';
import { publicObjectUrl } from '../src/lib/public-assets';
import { mime } from '../src/lib/hosted-storage';
import { verifyPreviewToken } from '../src/lib/hosted-preview';

const portal = new URL(process.env.PUBLIC_APP_URL || 'http://localhost:4321').origin;
const baseDomain = process.env.HOSTED_BASE_DOMAIN || 'localhost';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const server = createServer(async (req, res) => {
 try {
  if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://runtime').pathname);
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '..' || p.startsWith('.'))) throw new Error('Invalid path');
  const hostname = (req.headers.host || '').split(':')[0].toLowerCase();
  const headers: Record<string, string> = {
   'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
   'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
   'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${portal}`,
  };
  if (pathname === '/sdk/saltoplay.js' || (['localhost', '127.0.0.1'].includes(hostname) && pathname.startsWith('/demo/'))) {
   const root = pathname === '/sdk/saltoplay.js' ? resolve('public/sdk') : resolve('public/runtime');
   const name = pathname === '/sdk/saltoplay.js' ? 'saltoplay.js' : pathname.slice(1);
   const target = resolve(root, name); if (!target.startsWith(root + sep)) throw new Error('Invalid path');
   const body = await readFile(target);
   res.writeHead(200, { ...headers, 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': body.length });
   res.end(req.method === 'HEAD' ? undefined : body); return;
  }
  const gameId = hostname.endsWith('.' + baseDomain) ? hostname.slice(0, -baseDomain.length - 1) : '';
  if (!uuid.test(gameId)) throw new Error('Unknown game');
  let key: string, bytes: number, type: string, preview = false;
  if (pathname.startsWith('/media/')) {
   const id = pathname.slice(7).replace(/\.webp$/, ''); if (!uuid.test(id)) throw new Error('Unknown media');
   const [image] = await db().select().from(gameMedia).where(and(eq(gameMedia.id, id), eq(gameMedia.gameId, gameId), eq(gameMedia.status, 'ready')));
   if (!image?.artifactKey || !image.bytes) throw new Error('Image unavailable');
   key = image.artifactKey; bytes = image.bytes; type = 'image/webp';
  } else {
   const parts = pathname.split('/').filter(Boolean);
   let token = '';
   if (parts[0] === '_preview') { preview = true; parts.shift(); token = parts.shift() || ''; }
   const buildId = parts.shift() || ''; if (!uuid.test(buildId)) throw new Error('Unknown version');
   const name = parts.join('/') || 'index.html';
   const [row] = await db().select({ artifactId: builds.artifactId, status: builds.status, gameStatus: games.status, activeBuildId: games.activeBuildId, file: sql<{ bytes: number; type: string } | null>`${builds.manifest} -> ${name}::text` }).from(builds).innerJoin(games, eq(games.id, builds.gameId)).where(and(eq(builds.id, buildId), eq(builds.gameId, gameId)));
   if (!row?.artifactId) throw new Error('Build unavailable');
   if (preview) {
    if (!verifyPreviewToken(token, gameId, buildId) || !['ready', 'review', 'approved'].includes(row.status)) throw new Error('Preview expired');
   } else {
    if (row.gameStatus !== 'published' || row.status !== 'approved') throw new Error('Build unavailable');
    if (row.activeBuildId !== buildId) { const [release] = await db().select({ id: releases.id }).from(releases).where(and(eq(releases.gameId, gameId), eq(releases.buildId, buildId))).limit(1); if (!release) throw new Error('Unpublished build'); }
   }
   const file = row.file; if (!file) throw new Error('File not found');
   key = buildKey(gameId, buildId, row.artifactId, name); bytes = file.bytes; type = file.type;
  }
  const publicUrl = publicObjectUrl(key);
  if (publicUrl) { res.writeHead(302, { 'Cache-Control': 'no-store', Location: publicUrl }).end(); return; }
  let range: { start: number; end: number } | undefined;
  if (req.headers.range) {
   const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': 'bytes */' + bytes }).end(); return; }
   const start = match[1] ? Number(match[1]) : Math.max(0, bytes - Number(match[2]));
   const end = match[1] && match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1;
   if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes || start < 0) { res.writeHead(416, { 'Content-Range': 'bytes */' + bytes }).end(); return; }
   range = { start, end };
  }
  const responseHeaders = { ...headers, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': preview || type.startsWith('text/html') ? 'private, no-store' : 'public, max-age=31536000, immutable', 'Content-Length': String(range ? range.end - range.start + 1 : bytes), ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${bytes}` } : {}) };
  if (req.method === 'HEAD') { res.writeHead(range ? 206 : 200, responseHeaders).end(); return; }
  const body = await openObject(key, range);
  res.writeHead(range ? 206 : 200, responseHeaders);
  await pipeline(Readable.from(body), res);
 } catch {
  if (res.headersSent) res.destroy();
  else res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end('Juego, imagen o versión no disponible.');
 }
});
server.listen(Number(process.env.HOSTED_PORT || 4322), process.env.HOSTED_BIND || '127.0.0.1', () => console.log('SaltoUruguayServer runtime ready'));
