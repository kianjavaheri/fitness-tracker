import type { ID, Timestamp } from './types';

export function newId(): ID {
  // randomUUID is only exposed in secure contexts; fall back for LAN testing over plain http.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function now(): Timestamp {
  return new Date().toISOString();
}
