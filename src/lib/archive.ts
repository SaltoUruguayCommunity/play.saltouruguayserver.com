import yauzl from 'yauzl';
const extensions = new Set(['html', 'js', 'mjs', 'css', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'avif', 'woff', 'woff2', 'ttf', 'mp3', 'ogg', 'wav', 'mp4', 'webm', 'wasm', 'bin', 'data', 'txt', 'map']);
export function safeArchivePath(name: string) {
  return name.length <= 220 && /^[a-zA-Z0-9_./@ -]+$/.test(name) && !name.startsWith('/') && !name.includes('\\') && !name.split('/').some(p => p === '..' || p.startsWith('.') || /[. ]$/.test(p)) && !name.includes(':') && !name.split('/').some(p => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p));
}
export async function unpack(buffer: Buffer): Promise<Map<string, Buffer>> {
  if (buffer.length > 25 * 1024 * 1024) throw new Error('El ZIP supera los 25 MB.');
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(new Error('No pudimos leer el ZIP.')); return; }
      const files = new Map<string, Buffer>(); const paths = new Set<string>(); let total = 0, count = 0, done = false;
      const fail = (message: string) => { if (done) return; done = true; zip.close(); reject(new Error(message)); };
      zip.on('error', () => fail('El ZIP está dañado.'));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (!safeArchivePath(entry.fileName)) return fail('El paquete contiene una ruta no permitida.');
        const fileMode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (fileMode === 0xa000 || (fileMode && fileMode !== 0x8000 && fileMode !== 0x4000)) return fail('No se permiten enlaces ni archivos especiales.');
        if (entry.generalPurposeBitFlag & 1) return fail('No se permiten archivos cifrados.');
        if (++count > 1500) return fail('El paquete supera los 1500 archivos.');
        if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
        const ext = entry.fileName.split('.').pop()?.toLowerCase();
        if (!ext || !extensions.has(ext)) return fail('Formato de archivo no permitido: ' + entry.fileName);
        if (paths.has(entry.fileName.toLowerCase())) return fail('El paquete contiene rutas duplicadas.');
        paths.add(entry.fileName.toLowerCase());
        total += entry.uncompressedSize;
        if (total > 100 * 1024 * 1024 || entry.uncompressedSize > 30 * 1024 * 1024) return fail('El contenido descomprimido supera los límites.');
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return fail('No pudimos extraer un archivo.');
          const chunks: Buffer[] = []; let size = 0;
          stream.on('data', (chunk: Buffer) => { size += chunk.length; if (size > entry.uncompressedSize || size > 30 * 1024 * 1024) { stream.destroy(); fail('Tamaño de archivo inválido.'); } else chunks.push(chunk); });
          stream.on('error', () => fail('No pudimos extraer el contenido.'));
          stream.on('end', () => { if (done) return; if (size !== entry.uncompressedSize) return fail('Tamaño de archivo inválido.'); files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.on('end', () => { if (done) return; done = true; if (!files.has('index.html')) reject(new Error('El ZIP debe contener index.html en la raíz.')); else resolve(files); });
      zip.readEntry();
    });
  });
}
