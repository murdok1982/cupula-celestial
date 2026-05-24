/**
 * Hook que registra atajos de teclado tacticos.
 * Convenciones MIL-STD-1472: teclas F, Ctrl+letra. Esc cierra modal.
 */
import { useEffect } from 'react';

export type HotkeyHandler = (event: KeyboardEvent) => void;

export interface HotkeyBinding {
  /** Combinacion en formato "F1", "Ctrl+A", "Ctrl+Shift+L", "Escape". */
  combo: string;
  handler: HotkeyHandler;
  /** Si true, se ejecuta incluso si hay un input enfocado (e.g. Escape). */
  global?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function matchCombo(combo: string, ev: KeyboardEvent): boolean {
  const parts = combo.split('+').map((p) => p.trim().toLowerCase());
  const wantCtrl = parts.includes('ctrl');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');
  const key = parts[parts.length - 1] ?? '';
  if (wantCtrl !== ev.ctrlKey) return false;
  if (wantShift !== ev.shiftKey) return false;
  if (wantAlt !== ev.altKey) return false;
  return ev.key.toLowerCase() === key.toLowerCase();
}

export function useHotkeys(bindings: HotkeyBinding[]): void {
  useEffect(() => {
    function onKey(ev: KeyboardEvent): void {
      for (const b of bindings) {
        if (!b.global && isEditable(ev.target)) continue;
        if (matchCombo(b.combo, ev)) {
          ev.preventDefault();
          b.handler(ev);
          break;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings]);
}
