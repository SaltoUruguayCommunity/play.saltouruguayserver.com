import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { storageRoot } from '../src/lib/hosted-storage';
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const portal = new URL(process.env.PUBLIC_APP_URL || 'http://localhost:4321').origin;
const baseDomain = process.env.HOSTED_BASE_DOMAIN || 'localhost';
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405).end(); return; }
    const url = new URL(req.url || '/', 'http://runtime');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '..' || p.startsWith('.'))) throw new Error('Invalid path');
    const hostname = (req.headers.host || '').split(':')[0];
    let root: string, relative: string;
    if (pathname === '/sdk/saltoplay.js') { root = resolve('public/sdk'); relative = 'saltoplay.js'; }
    else if (['localhost', '127.0.0.1'].includes(hostname) && pathname.startsWith('/demo/')) { root = resolve('public/runtime'); relative = pathname.slice(1); }
    else {
      const gameId = hostname.endsWith('.' + baseDomain) ? hostname.slice(0, -baseDomain.length - 1) : '';
      if (!/^[0-9a-f-]{36}$/.test(gameId)) throw new Error('Unknown game');
      const published = JSON.parse(await readFile(resolve(storageRoot(), gameId, 'published.json'), 'utf8'));
      const [, buildId, ...parts] = pathname.split('/');
      if (buildId !== published.buildId || !/^[0-9a-f-]{36}$/.test(buildId)) throw new Error('Build unavailable');
      root = resolve(storageRoot(), gameId, buildId); relative = parts.join('/') || 'index.html';
    }
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep)) throw new Error('Invalid path');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${portal}`, 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cache-Control': 'no-store', 'Referrer-Policy': 'origin' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' }).end('Juego o versión no disponible.'); }
});
server.listen(Number(process.env.HOSTED_PORT || 4322), process.env.HOSTED_BIND || '127.0.0.1', () => console.log('SaltoPlay runtime ready on port ' + (process.env.HOSTED_PORT || 4322)));
