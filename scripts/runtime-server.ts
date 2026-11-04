import 'dotenv/config';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { serveHostedRequest } from '../src/lib/hosted-runtime';

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
    const headers = new Headers();
    if (req.headers.range) headers.set('range', req.headers.range);
    const response = await serveHostedRequest(new Request(url, { method: req.method || 'GET', headers }), true);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), res);
    else res.end();
  } catch {
    if (res.headersSent) res.destroy();
    else res.writeHead(500, { 'Cache-Control': 'no-store' }).end('Runtime no disponible.');
  }
});
server.listen(Number(process.env.HOSTED_PORT || 4322), process.env.HOSTED_BIND || '127.0.0.1', () => console.log('SaltoUruguayServer runtime ready'));
