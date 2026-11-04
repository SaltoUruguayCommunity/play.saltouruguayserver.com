import { publicObjectUrl } from './public-assets';
import { hostedBaseDomain } from './hosted-config';
export function runtimeOrigin(gameId: string) {
  const base = hostedBaseDomain();
  return base === 'localhost' ? `http://${gameId}.localhost:4322` : `https://${gameId}.${base}`;
}

/** Images use the public bucket/CDN base, with an optional image-specific override. */
export function mediaUrl(gameId: string, mediaId: string, artifactKey?: string | null) {
  const configured = (import.meta.env?.MEDIA_CDN_URL || process.env.MEDIA_CDN_URL || import.meta.env?.S3_PUBLIC_URL || process.env.S3_PUBLIC_URL || '').trim();
  if (configured && artifactKey) return publicObjectUrl(artifactKey, configured)!;
  return runtimeOrigin(gameId) + '/media/' + mediaId + '.webp';
}
