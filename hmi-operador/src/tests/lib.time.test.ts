import { describe, it, expect } from 'vitest';
import { formatZulu, formatZuluTime, formatCountdown, formatTti, formatAge } from '@/lib/time';

describe('lib/time', () => {
  it('formatZulu produce DTG OTAN DDHHMMZ MMM YY', () => {
    const d = new Date(Date.UTC(2026, 4, 19, 14, 30, 0));
    expect(formatZulu(d)).toBe('191430Z MAY 26');
  });

  it('formatZuluTime HH:MM:SSZ', () => {
    const d = new Date(Date.UTC(2026, 4, 19, 14, 30, 5));
    expect(formatZuluTime(d)).toBe('14:30:05Z');
  });

  it('formatCountdown menos de un minuto', () => {
    expect(formatCountdown(45)).toBe('00:45');
  });

  it('formatCountdown mas de un minuto', () => {
    expect(formatCountdown(125)).toBe('02:05');
  });

  it('formatCountdown negativo -> 00:00', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('formatTti null -> --', () => {
    expect(formatTti(null)).toBe('--');
  });

  it('formatTti segundos', () => {
    expect(formatTti(45)).toBe('45s');
  });

  it('formatTti minutos', () => {
    expect(formatTti(125)).toBe('2m 05s');
  });

  it('formatAge menos de 60s', () => {
    const now = Date.now();
    expect(formatAge(now - 30_000, now)).toBe('30s');
  });

  it('formatAge minutos', () => {
    const now = Date.now();
    expect(formatAge(now - 120_000, now)).toBe('2m');
  });
});
