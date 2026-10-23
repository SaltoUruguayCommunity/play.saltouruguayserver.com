import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unpack, safeArchivePath } from '../src/lib/archive';
function zip(entries: { name: string; data?: string; mode?: number; declaredSize?: number }[]) {
  const local: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const entry of entries) { const name = Buffer.from(entry.name), data = Buffer.from(entry.data || '<html></html>'); const size = entry.declaredSize ?? data.length;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(size, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x314, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(((entry.mode || 0x81a4) * 65536) >>> 0, 38); central.writeUInt32LE(offset, 42);
    local.push(header, name, data); directory.push(central, name); offset += header.length + name.length + data.length;
  }
  const central = Buffer.concat(directory); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, central, end]);
}
test('hosted package preserves case-sensitive asset paths', async () => { const result = await unpack(zip([{ name: 'index.html' }, { name: 'Assets/MyGame.js', data: 'console.log(1)' }])); assert.equal(result.has('Assets/MyGame.js'), true); });
test('rejects traversal, Windows device paths, hidden files and absolute paths', () => { for (const name of ['../escape.js', '/index.html', 'a/../../x.js', 'a\\x.js', 'C:/x.js', 'con.js', 'AUX/file.js', '.env', 'a/.hidden/x.js', 'x\0.js']) assert.equal(safeArchivePath(name), false, name); });
test('rejects symlinks and server executables', async () => { await assert.rejects(unpack(zip([{ name: 'index.html' }, { name: 'link.js', mode: 0xa1ff }]))); await assert.rejects(unpack(zip([{ name: 'index.html' }, { name: 'shell.php' }]))); });
test('rejects missing entrypoint and case-colliding assets', async () => { await assert.rejects(unpack(zip([{ name: 'game.html' }]))); await assert.rejects(unpack(zip([{ name: 'index.html' }, { name: 'Game.js' }, { name: 'game.js' }]))); });
test('rejects oversized declared entries before extraction', async () => { await assert.rejects(unpack(zip([{ name: 'index.html', declaredSize: 150 * 1024 * 1024 }]))); });
