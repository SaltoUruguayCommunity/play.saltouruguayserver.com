import { getDomain } from 'tldts';

/** Shared by Astro's serverless runtime and the optional local Node runtime. */
export function hostedPortalOrigin() {
  return new URL(process.env.PUBLIC_APP_URL || import.meta.env?.PUBLIC_APP_URL || 'http://localhost:4321').origin;
}

export function hostedBaseDomain() {
  const raw = (process.env.HOSTED_BASE_DOMAIN || import.meta.env?.HOSTED_BASE_DOMAIN || '').trim().toLowerCase();
  if (!raw) {
    if (process.env.VERCEL) throw new Error('Configurá HOSTED_BASE_DOMAIN para los juegos alojados.');
    return 'localhost';
  }
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(raw) || !getDomain(raw, { allowPrivateDomains: true })) throw new Error('HOSTED_BASE_DOMAIN debe ser un hostname válido sin protocolo, puerto ni *.');
  const portalHost = new URL(hostedPortalOrigin()).hostname;
  if (portalHost === raw || portalHost.endsWith('.' + raw)) throw new Error('El wildcard de juegos no puede incluir el host del portal.');
  return raw;
}

export function isHostedRuntimeHost(hostname: string) {
  const configured = (process.env.HOSTED_BASE_DOMAIN || import.meta.env?.HOSTED_BASE_DOMAIN || '').trim().toLowerCase();
  const base = configured || 'localhost';
  return hostname.toLowerCase().endsWith('.' + base) || (Boolean(configured) && hostname.toLowerCase() === base);
}

