import { putObject, buildKey } from './object-storage';
import { extname } from 'node:path';
export const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain', '.data': 'application/octet-stream', '.bin': 'application/octet-stream', '.map': 'application/json',
};
export async function storeBuild(gameId: string, buildId: string, artifactId: string, files: Map<string, Buffer>) {
  const manifest: Record<string, { bytes: number; type: string }> = {};
  const pending = files.entries();
  let uploadError: unknown;
  // Bounded concurrency: do not make 1500 serial network round-trips or open
  // one socket per file in a single serverless invocation.
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (const [name, body] of pending) {
      if (uploadError) break;
      const type = mime[extname(name).toLowerCase()] || 'application/octet-stream';
      try { await putObject(buildKey(gameId, buildId, artifactId, name), body, type); }
      catch (error) { uploadError = error; break; }
      manifest[name] = { bytes: body.length, type };
    }
  }));
  if (uploadError) throw uploadError;
  return manifest;
}
