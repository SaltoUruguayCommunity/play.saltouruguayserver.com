export function runtimeOrigin(gameId: string) {
  const base = import.meta.env.HOSTED_BASE_DOMAIN || process.env.HOSTED_BASE_DOMAIN;
  return base ? `https://${gameId}.${base}` : `http://${gameId}.localhost:4322`;
}
