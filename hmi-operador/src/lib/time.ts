/**
 * Utilidades de tiempo en formato militar (Zulu / DTG).
 * Estandar OTAN: DDHHMMZ MMM YY (e.g. 191430Z MAY 26).
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Formatea un timestamp como Date-Time Group OTAN: 191430Z MAY 26.
 */
export function formatZulu(date: Date = new Date()): string {
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const month = MONTHS[date.getUTCMonth()] ?? 'XXX';
  const year = date.getUTCFullYear().toString().slice(-2);
  return `${day}${hour}${min}Z ${month} ${year}`;
}

/** Hora corta HH:MM:SS Z para status bar. */
export function formatZuluTime(date: Date = new Date()): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}Z`;
}

/** Convierte segundos a mm:ss para countdowns. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${pad2(m)}:${pad2(r)}`;
}

/** TTI legible: "12s", "1m 24s". */
export function formatTti(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--';
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${pad2(s)}s`;
}

/** Edad desde un timestamp epoch ms. */
export function formatAge(tsMs: number, nowMs: number = Date.now()): string {
  const delta = Math.max(0, (nowMs - tsMs) / 1000);
  if (delta < 1) return '<1s';
  if (delta < 60) return `${delta.toFixed(0)}s`;
  if (delta < 3600) return `${(delta / 60).toFixed(0)}m`;
  return `${(delta / 3600).toFixed(1)}h`;
}
