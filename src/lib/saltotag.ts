export const SALTOTAG_CHANGE_INTERVAL_DAYS = 30;
export const SALTOTAG_CHANGE_INTERVAL_MS = SALTOTAG_CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
export function nextSaltoTagChange(lastChange: Date | null): Date | null {
  return lastChange ? new Date(lastChange.getTime() + SALTOTAG_CHANGE_INTERVAL_MS) : null;
}
export function canChangeSaltoTag(lastChange: Date | null, now = new Date()) {
  const next = nextSaltoTagChange(lastChange);
  return !next || now.getTime() >= next.getTime();
}
export const formatSaltoTagDate = (date: Date) => date.toLocaleString('es-UY', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Montevideo',
});
