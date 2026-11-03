/** The public base already maps S3_PREFIX; do not append the bucket prefix twice. */
export function publicObjectUrl(key: string, configured = process.env.S3_PUBLIC_URL || ''): string | null {
  if (!configured.trim()) return null;
  if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid public object key');
  const base = new URL(configured.trim().replace(/\/+$/, '') + '/');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Public storage URL must be an HTTPS base URL without credentials, query or fragment.');
  const portal = process.env.PUBLIC_APP_URL;
  if (portal && base.origin === new URL(portal).origin) throw new Error('Game storage must use an origin separate from the portal.');
  return base.href + key.split('/').map(encodeURIComponent).join('/');
}
