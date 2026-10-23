import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const pkce = (value: string) => createHash('sha256').update(value).digest('base64url');
export function equal(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function appUrl() { return import.meta.env.PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || 'http://localhost:4321'; }
export function safeReturn(value: string | null) { return value?.startsWith('/') && !value.startsWith('//') && !/[\\\x00-\x20\x7f]/.test(value) ? value : '/'; }
export function safeWebUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }
export function admin(player: { subject: string; isAdmin: boolean }) {
  if (player.isAdmin === true) return true;
  // Optional local override; the default role comes from verified OAuth userinfo.
  return (import.meta.env.ADMIN_SUS_SUBJECTS || process.env.ADMIN_SUS_SUBJECTS || '').split(',').map((x: string) => x.trim()).filter(Boolean).includes(player.subject);
}
export const scopes = ['profile:read', 'saltotag:read', 'achievements:read', 'achievements:write', 'saves:read', 'saves:write'] as const;
