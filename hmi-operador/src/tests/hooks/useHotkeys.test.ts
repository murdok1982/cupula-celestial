import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHotkeys } from '@/hooks/useHotkeys';

describe('useHotkeys', () => {
  it('fires callback on matching key', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ combo: 'F1', handler }]));
    const ev = new KeyboardEvent('keydown', { key: 'F1' });
    window.dispatchEvent(ev);
    expect(handler).toHaveBeenCalled();
  });

  it('does not fire for unmatching key', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ combo: 'F1', handler }]));
    const ev = new KeyboardEvent('keydown', { key: 'F2' });
    window.dispatchEvent(ev);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles Ctrl+ combination', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys([{ combo: 'Ctrl+A', handler }]));
    const ev = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
    window.dispatchEvent(ev);
    expect(handler).toHaveBeenCalled();
  });
});
