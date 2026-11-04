import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { builds, games, gameMedia, releases } from '../db/schema';
import { openObject, buildKey, assertStorageAvailable } from './object-storage';
import { mime } from './hosted-storage';
import { verifyPreviewToken } from './hosted-preview';
import { hostedBaseDomain, hostedPortalOrigin } from './hosted-config';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new Response('Juego, imagen o versión no disponible.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** Always returns content on the game's origin; never redirects HTML to a shared CDN. */
export async function serveHostedRequest(request: Request, localDemo = false): Promise<Response> {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
    const url = new URL(request.url), base = hostedBaseDomain(), portal = hostedPortalOrigin();
    const gameId = url.hostname.endsWith('.' + base) ? url.hostname.slice(0, -base.length - 1) : '';
    const demo = localDemo && !process.env.VERCEL && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!uuid.test(gameId) && !demo) return unavailable();
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || /[\x00-\x1f\x7f]/.test(pathname) || pathname.split('/').some(p => p === '..' || p.startsWith('.'))) return unavailable();
    const headers = new Headers({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ${portal}/api/v1/ ${portal}/oauth/token; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${portal}`,
      'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
    });
    if (pathname === '/sdk/saltoplay.js' || (demo && pathname.startsWith('/demo/'))) {
      const root = pathname === '/sdk/saltoplay.js' ? resolve('public/sdk') : resolve('public/runtime');
      const target = resolve(root, pathname === '/sdk/saltoplay.js' ? 'saltoplay.js' : pathname.slice(1));
      if (!target.startsWith(root + sep)) return unavailable();
      const body = await readFile(target);
      headers.set('Content-Type', mime[extname(target)] || 'application/octet-stream');
      headers.set('Content-Length', String(body.length));
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), { headers });
    }
    assertStorageAvailable();
    let key: string, bytes: number, type: string;
    if (pathname.startsWith('/media/')) {
      const id = pathname.slice(7).replace(/\.webp$/, '');
      if (!uuid.test(id)) return unavailable();
      const [image] = await db().select().from(gameMedia).where(and(eq(gameMedia.id, id), eq(gameMedia.gameId, gameId), eq(gameMedia.status, 'ready')));
      if (!image?.artifactKey || !image.bytes) return unavailable();
      key = image.artifactKey; bytes = image.bytes; type = 'image/webp';
    } else {
      const parts = pathname.split('/').filter(Boolean);
      const preview = parts[0] === '_preview';
      let token = '';
      if (preview) { parts.shift(); token = parts.shift() || ''; }
      const buildId = parts.shift() || '';
      if (!uuid.test(buildId)) return unavailable();
      const name = parts.join('/') || 'index.html';
      const [row] = await db().select({ artifactId: builds.artifactId, status: builds.status, gameStatus: games.status, activeBuildId: games.activeBuildId, file: sql<{ bytes: number; type: string } | null>`${builds.manifest} -> ${name}::text` }).from(builds).innerJoin(games, eq(games.id, builds.gameId)).where(and(eq(builds.id, buildId), eq(builds.gameId, gameId)));
      if (!row?.artifactId || !row.file) return unavailable();
      if (preview) {
        if (!verifyPreviewToken(token, gameId, buildId) || !['ready', 'review', 'approved'].includes(row.status)) return unavailable();
      } else {
        if (row.gameStatus !== 'published' || row.status !== 'approved') return unavailable();
        if (row.activeBuildId !== buildId) {
          const [release] = await db().select({ id: releases.id }).from(releases).where(and(eq(releases.gameId, gameId), eq(releases.buildId, buildId))).limit(1);
          if (!release) return unavailable();
        }
      }
      key = buildKey(gameId, buildId, row.artifactId, name); bytes = row.file.bytes; type = row.file.type;
    }
    let range: { start: number; end: number } | undefined;
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, bytes - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes || start < 0) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes}`, 'Cache-Control': 'no-store' } });
      range = { start, end };
      headers.set('Content-Range', `bytes ${start}-${end}/${bytes}`);
    }
    headers.set('Content-Type', type);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(range ? range.end - range.start + 1 : bytes));
    const status = range ? 206 : 200;
    if (request.method === 'HEAD') return new Response(null, { status, headers });
    // Stream instead of buffering into the Function response payload.
    const stream = Readable.toWeb(Readable.from(await openObject(key, range))) as ReadableStream<Uint8Array>;
    return new Response(stream, { status, headers });
  } catch { return unavailable(); }
}
