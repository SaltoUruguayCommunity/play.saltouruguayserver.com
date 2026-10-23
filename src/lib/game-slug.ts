export function gameSlug(title: string, attempt = 1): string {
  const normalized = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const base = normalized.length >= 3 ? normalized : `juego${normalized ? `-${normalized}` : ''}`;
  const suffix = attempt > 1 ? `-${crypto.randomUUID().slice(0, 8)}` : '';
  return base.slice(0, 60 - suffix.length).replace(/-+$/g, '') + suffix;
}
