import { HttpError } from './http';
export const MAX_SAVE_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * Validates a save payload: bounded depth, no dangerous keys, bounded wire size.
 * Returns the measured byte size of the canonical JSON representation.
 */
export function checkSaveData(value: unknown): number {
  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) throw new HttpError(400, 'invalid_save_data', 'El guardado es demasiado profundo.');
    if (node === null || node === undefined) return;
    if (typeof node === 'number' && !Number.isFinite(node)) throw new HttpError(400, 'invalid_save_data', 'El guardado contiene números inválidos.');
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return;
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    if (typeof node === 'object') {
      for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(key)) throw new HttpError(400, 'invalid_save_data', 'El guardado contiene una clave no permitida.');
        walk(item, depth + 1);
      }
      return;
    }
    throw new HttpError(400, 'invalid_save_data', 'El guardado sólo puede contener datos JSON.');
  };
  walk(value, 0);
  const bytes = Buffer.byteLength(JSON.stringify(value ?? null));
  if (bytes > MAX_SAVE_BYTES) throw new HttpError(413, 'save_too_large', 'El guardado supera 1 MB.');
  return bytes;
}
