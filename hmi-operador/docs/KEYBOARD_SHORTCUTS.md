# Atajos de teclado - HMI Cupula Celestial

Convenciones MIL-STD-1472H y WCAG 2.1.1 (Keyboard) / 2.1.2 (No Keyboard Trap).
Todos los atajos pueden bloquearse desde Settings si la unidad lo requiere.

## Navegacion

| Tecla | Accion |
|-------|--------|
| `F1` | Ayuda / panel de Ajustes |
| `F2` | Vista de pistas (Track List) |
| `F3` | Mapa / Dashboard |
| `F4` | Recomendaciones / Engagements |
| `Tab` | Siguiente elemento focalizable |
| `Shift+Tab` | Elemento anterior |

## Decision sobre engagement

| Tecla | Accion | Requiere |
|-------|--------|----------|
| `Ctrl+A` | Abrir dialogo de **autorizacion** | Recomendacion activa con `operator_action_required: true` y rol >= OPERADOR |
| `Ctrl+R` | Abrir dialogo de **rechazo** | Recomendacion activa |
| `Ctrl+D` | Abrir dialogo de **diferir** | Recomendacion activa |
| `Esc` | Cerrar modal sin enviar nada | Siempre |

## Mapa

| Tecla | Accion |
|-------|--------|
| `Click` sobre pista | Selecciona la pista (panel derecho actualiza detalle) |
| `Doble-click` sobre pista | **Slew-to-cue**: camara vuela al objetivo |
| Rueda raton | Zoom |
| Click derecho + arrastrar | Pitch / orbit |

## Modos especiales

| Tecla | Accion |
|-------|--------|
| `Ctrl+Shift+N` | Toggle modo Vision Nocturna (rojo monocromo) |
| `Ctrl+Shift+L` | Logout inmediato (auto-purga de tokens en memoria) |

## Auditoria

| Tecla | Accion |
|-------|--------|
| `Ctrl+Shift+V` | Verificar cadena Merkle del audit-log |

## Comportamiento de inputs

- Cuando el foco esta en un `<input>` / `<textarea>` / `<select>` los hotkeys
  **no globales** se desactivan. Esto es para que `Ctrl+A` selecccione texto
  en lugar de abrir el dialogo de autorizacion cuando estas escribiendo un
  motivo de rechazo.
- `Esc` y `Ctrl+Shift+L` son hotkeys **globales** por seguridad.

## Diseno

- Atajos con `F` (F1-F4) para acciones de **navegacion frecuente** sin
  modificadores: el operador puede memorizarlos con una sola mano.
- Atajos con `Ctrl` para acciones de **decision** que modifican estado: el
  modificador previene activaciones accidentales.
- Atajos con `Ctrl+Shift` para acciones de **seguridad** (logout, cambios de
  modo) que no deben activarse por error.
