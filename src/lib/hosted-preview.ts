import { createHmac, timingSafeEqual } from 'node:crypto';
function secret() { const value = process.env.HOSTED_PREVIEW_SECRET; if (!value || value.length < 32) throw new Error('Configurá HOSTED_PREVIEW_SECRET con al menos 32 caracteres.'); return value; }
export function createPreviewToken(gameId: string, buildId: string) {
  const payload = Buffer.from(JSON.stringify({ gameId, buildId, exp: Date.now() + 15 * 60_000 })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret()).update(payload).digest('base64url');
}
export function verifyPreviewToken(value: string, gameId: string, buildId: string) {
  try {
    const [payload, signature, extra] = value.split('.'); if (!payload || !signature || extra) return false;
    const expected = createHmac('sha256', secret()).update(payload).digest(); const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.gameId === gameId && data.buildId === buildId && Number.isFinite(data.exp) && data.exp > Date.now();
  } catch { return false; }
}
