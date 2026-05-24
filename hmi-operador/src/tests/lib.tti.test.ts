import { describe, it, expect } from 'vitest';
import { ttiSeverity, priorityScore, sortByPriority } from '@/lib/tti';
import { MOCK_TRACKS } from '@/mocks/mockData';

describe('lib/tti', () => {
  it('ttiSeverity critical para < 10s', () => {
    expect(ttiSeverity(5)).toBe('critical');
  });

  it('ttiSeverity high para 10-30s', () => {
    expect(ttiSeverity(20)).toBe('high');
  });

  it('ttiSeverity medium para 30-120s', () => {
    expect(ttiSeverity(60)).toBe('medium');
  });

  it('ttiSeverity low para null o > 120s', () => {
    expect(ttiSeverity(null)).toBe('low');
    expect(ttiSeverity(200)).toBe('low');
  });

  it('priorityScore es mayor para hostiles confirmados con bajo TTI', () => {
    const hostile = MOCK_TRACKS.find((t) => t.classification === 'HOSTIL_CONFIRMADO');
    const civil = MOCK_TRACKS.find((t) => t.classification === 'CIVIL');
    if (!hostile || !civil) throw new Error('mock');
    expect(priorityScore(hostile)).toBeGreaterThan(priorityScore(civil));
  });

  it('sortByPriority pone HOSTIL_CONFIRMADO primero', () => {
    const sorted = sortByPriority([...MOCK_TRACKS]);
    expect(sorted[0]?.classification).toBe('HOSTIL_CONFIRMADO');
  });
});
