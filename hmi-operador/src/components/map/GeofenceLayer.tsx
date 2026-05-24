/**
 * Las geofences se gestionan dentro de CesiumMap (imperativo).
 * Este wrapper permite alternar visibilidad desde la UI.
 */
import { useMapStore } from './useMapStore';
import { Button } from '@/components/ui/button';
import { Shield, ShieldOff } from 'lucide-react';

export function GeofenceLayerToggle(): JSX.Element {
  const enabled = useMapStore((s) => s.showGeofences);
  const toggle = useMapStore((s) => s.toggleGeofences);
  return (
    <Button
      variant={enabled ? 'tactical' : 'outline'}
      size="sm"
      onClick={toggle}
      aria-pressed={enabled}
      data-testid="toggle-geofences"
    >
      {enabled ? <Shield className="h-4 w-4" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
      Geofences
    </Button>
  );
}
